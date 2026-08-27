package apimart

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relay/channel"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/google/uuid"

	"github.com/gin-gonic/gin"
)

const (
	maxUploadImageBytes   = 20 << 20
	maxDownloadImageBytes = 50 << 20
	pollTimeout           = 180 * time.Second
)

type Adaptor struct{}

func (a *Adaptor) Init(*relaycommon.RelayInfo) {}

func (a *Adaptor) GetRequestURL(info *relaycommon.RelayInfo) (string, error) {
	if info == nil {
		return "", errors.New("APIMart adaptor: relay info is nil")
	}
	if info.ChannelBaseUrl == "" {
		info.ChannelBaseUrl = constant.ChannelBaseURLs[constant.ChannelTypeAPIMart]
	}
	return relaycommon.GetFullRequestURL(info.ChannelBaseUrl, "/v1/images/generations", info.ChannelType), nil
}

func (a *Adaptor) SetupRequestHeader(c *gin.Context, req *http.Header, info *relaycommon.RelayInfo) error {
	if info == nil || info.ApiKey == "" {
		return errors.New("APIMart adaptor: api key is required")
	}
	channel.SetupApiRequestHeader(info, c, req)
	req.Set("Authorization", "Bearer "+info.ApiKey)
	req.Set("Content-Type", "application/json")
	req.Set("Accept", "application/json")
	model := info.UpstreamModelName
	if model == "" {
		if request, ok := info.Request.(*dto.ImageRequest); ok {
			model = request.Model
		}
	}
	if model == dto.APIMartGrokImagineModel {
		req.Set("X-APIMart-Response-Version", "2026-07-27")
		req.Set("Idempotency-Key", uuid.NewString())
	}
	return nil
}

func (a *Adaptor) ConvertImageRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.ImageRequest) (any, error) {
	if info == nil {
		return nil, errors.New("APIMart adaptor: relay info is nil")
	}
	if err := request.ValidateAPIMartImageRequest(); err != nil {
		return nil, invalidRequest(err)
	}
	if info.RelayMode == relayconstant.RelayModeImagesEdits && !strings.Contains(c.GetHeader("Content-Type"), "multipart/form-data") {
		return nil, invalidRequest(errors.New("APIMart image edits require multipart/form-data"))
	}
	options, err := request.APIMartImageOptions()
	if err != nil {
		return nil, err
	}
	model := strings.TrimSpace(info.UpstreamModelName)
	if model == "" {
		model = request.Model
	}
	result := &imageRequest{Model: model, Prompt: request.Prompt, Size: options.Size, AspectRatio: options.AspectRatio, Resolution: options.Resolution, N: request.N}
	if request.Quality != "" {
		quality := request.Quality
		result.Quality = quality
	}
	if err := decodeImageFields(request, result); err != nil {
		return nil, err
	}
	if info.RelayMode == relayconstant.RelayModeImagesEdits {
		images, mask, err := uploadEditImages(c, info)
		if err != nil {
			return nil, err
		}
		result.ImageURLs = images
		result.MaskURL = mask
		if model == dto.APIMartGrokImagineModel {
			result.Quality = ""
		}
	}
	return result, nil
}

func decodeImageFields(request dto.ImageRequest, result *imageRequest) error {
	for _, field := range []struct {
		raw json.RawMessage
		set func(string)
	}{
		{request.Background, func(value string) { result.Background = &value }},
		{request.Moderation, func(value string) { result.Moderation = &value }},
		{request.OutputFormat, func(value string) { result.OutputFormat = &value }},
	} {
		if len(field.raw) == 0 {
			continue
		}
		var value string
		if err := common.Unmarshal(field.raw, &value); err != nil {
			return err
		}
		field.set(value)
	}
	if len(request.OutputCompression) != 0 {
		var value int
		if err := common.Unmarshal(request.OutputCompression, &value); err != nil {
			return err
		}
		result.OutputCompression = &value
	}
	return nil
}

func (a *Adaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, body io.Reader) (any, error) {
	return channel.DoApiRequest(a, c, info, body)
}

func (r submitResponse) taskID() (string, error) {
	var task submitTask
	switch common.GetJsonType(r.Data) {
	case "object":
		if err := common.Unmarshal(r.Data, &task); err != nil {
			return "", err
		}
	case "array":
		var tasks []submitTask
		if err := common.Unmarshal(r.Data, &tasks); err != nil {
			return "", err
		}
		if len(tasks) == 0 {
			return "", errors.New("APIMart task submission returned no task")
		}
		task = tasks[0]
	default:
		return "", errors.New("APIMart task submission returned invalid data")
	}
	if task.ID != "" {
		return task.ID, nil
	}
	if task.TaskID != "" {
		return task.TaskID, nil
	}
	return "", errors.New("APIMart task submission returned no task ID")
}

func (a *Adaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (any, *types.NewAPIError) {
	defer service.CloseResponseBodyGracefully(resp)
	var submitted submitResponse
	if err := common.DecodeJson(resp.Body, &submitted); err != nil {
		return nil, types.NewError(err, types.ErrorCodeBadResponseBody)
	}
	if submitted.Error != nil {
		return nil, upstreamError("APIMart task submission failed", submitted.Error)
	}
	taskID, err := submitted.taskID()
	if err != nil {
		return nil, types.NewError(err, types.ErrorCodeBadResponseBody)
	}
	deadline := time.NewTimer(pollTimeout)
	defer deadline.Stop()
	if err := waitFor(c, 2*time.Second, deadline.C); err != nil {
		return nil, pollError(err)
	}
	for {
		task, err := fetchTask(c, info, taskID)
		if err != nil {
			return nil, err
		}
		switch strings.ToLower(task.Status) {
		case "pending", "processing", "submitted", "in_progress":
			if err := waitFor(c, 5*time.Second, deadline.C); err != nil {
				return nil, pollError(err)
			}
		case "completed":
			return writeImageResponse(c, info, task)
		case "failed", "cancelled":
			return nil, upstreamError("APIMart image task "+task.Status, task.Error)
		default:
			return nil, types.NewError(fmt.Errorf("APIMart image task returned invalid status %q", task.Status), types.ErrorCodeBadResponse)
		}
	}
}

func waitFor(c *gin.Context, delay time.Duration, timeout <-chan time.Time) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-c.Request.Context().Done():
		return c.Request.Context().Err()
	case <-timeout:
		return errors.New("APIMart image task timed out")
	case <-timer.C:
		return nil
	}
}

func pollError(err error) *types.NewAPIError {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) || strings.Contains(err.Error(), "timed out") {
		return types.NewErrorWithStatusCode(err, types.ErrorCodeBadResponse, http.StatusGatewayTimeout)
	}
	return types.NewError(err, types.ErrorCodeBadResponse)
}

func fetchTask(c *gin.Context, info *relaycommon.RelayInfo, taskID string) (*taskData, *types.NewAPIError) {
	url := relaycommon.GetFullRequestURL(info.ChannelBaseUrl, "/v1/tasks/"+taskID, info.ChannelType)
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, url, nil)
	if err != nil {
		return nil, types.NewError(err, types.ErrorCodeDoRequestFailed)
	}
	req.Header.Set("Authorization", "Bearer "+info.ApiKey)
	req.Header.Set("Accept", "application/json")
	resp, err := channel.DoRequest(c, req, info)
	if err != nil {
		return nil, types.NewError(err, types.ErrorCodeDoRequestFailed)
	}
	defer service.CloseResponseBodyGracefully(resp)
	if resp.StatusCode != http.StatusOK {
		return nil, types.NewError(fmt.Errorf("APIMart task query returned status %d", resp.StatusCode), types.ErrorCodeBadResponse)
	}
	var result taskResponse
	if err := common.DecodeJson(resp.Body, &result); err != nil {
		return nil, types.NewError(err, types.ErrorCodeBadResponseBody)
	}
	if result.Error != nil {
		return nil, upstreamError("APIMart task query failed", result.Error)
	}
	return &result.Data, nil
}

func writeImageResponse(c *gin.Context, info *relaycommon.RelayInfo, task *taskData) (any, *types.NewAPIError) {
	urls := make([]string, 0, len(task.Result.Images))
	for _, image := range task.Result.Images {
		for _, url := range image.URL {
			if strings.TrimSpace(url) != "" {
				urls = append(urls, url)
			}
		}
	}
	if len(urls) == 0 {
		return nil, types.NewError(errors.New("APIMart completed task returned no image URLs"), types.ErrorCodeBadResponseBody)
	}
	response := dto.ImageResponse{Created: common.GetTimestamp(), Data: make([]dto.ImageData, 0, len(urls))}
	request, _ := info.Request.(*dto.ImageRequest)
	for _, url := range urls {
		if request != nil && strings.EqualFold(request.ResponseFormat, "b64_json") {
			data, err := downloadImageBase64(c, info, url)
			if err != nil {
				return nil, types.NewErrorWithStatusCode(err, types.ErrorCodeBadResponse, http.StatusBadGateway)
			}
			response.Data = append(response.Data, dto.ImageData{B64Json: data})
		} else {
			response.Data = append(response.Data, dto.ImageData{Url: url})
		}
	}
	body, err := common.Marshal(response)
	if err != nil {
		return nil, types.NewError(err, types.ErrorCodeBadResponseBody)
	}
	c.Header("Content-Type", "application/json")
	c.Status(http.StatusOK)
	_, _ = c.Writer.Write(body)
	usage := &dto.Usage{}
	if task.Usage.InputTokens >= 0 && task.Usage.OutputTokens >= 0 && task.Usage.TotalTokens == task.Usage.InputTokens+task.Usage.OutputTokens {
		usage.PromptTokens = task.Usage.InputTokens
		usage.CompletionTokens = task.Usage.OutputTokens
		usage.TotalTokens = task.Usage.TotalTokens
		usage.PromptTokensDetails.CachedTokens = task.Usage.InputTokensDetails.CachedTokens
		usage.PromptTokensDetails.TextTokens = task.Usage.InputTokensDetails.TextTokens
		usage.PromptTokensDetails.ImageTokens = task.Usage.InputTokensDetails.ImageTokens
		usage.CompletionTokenDetails.TextTokens = task.Usage.OutputTokensDetails.TextTokens
		usage.CompletionTokenDetails.ImageTokens = task.Usage.OutputTokensDetails.ImageTokens
	} else if request != nil {
		usage.CompletionTokens = request.GetTokenCountMeta().MaxTokens
		usage.TotalTokens = usage.CompletionTokens
	}
	if info.PriceData.UsePrice {
		info.PriceData.AddOtherRatio("n", float64(len(response.Data)))
	}
	return usage, nil
}

func uploadEditImages(c *gin.Context, info *relaycommon.RelayInfo) ([]string, string, error) {
	form := c.Request.MultipartForm
	if form == nil {
		return nil, "", errors.New("APIMart image edits require multipart/form-data")
	}
	files := selectImageFiles(form)
	if len(files) == 0 {
		return nil, "", invalidRequest(errors.New("APIMart image edits require at least one image"))
	}
	maxImages := 16
	if request, ok := info.Request.(*dto.ImageRequest); ok && request.Model == dto.APIMartGrokImagineModel {
		maxImages = 3
	}
	if len(files) > maxImages {
		return nil, "", invalidRequest(fmt.Errorf("APIMart image edits allow at most %d images", maxImages))
	}
	urls := make([]string, 0, len(files))
	for _, file := range files {
		url, err := uploadImage(c, info, file)
		if err != nil {
			return nil, "", err
		}
		urls = append(urls, url)
	}
	var mask string
	if masks := form.File["mask"]; len(masks) > 0 {
		var err error
		mask, err = uploadImage(c, info, masks[0])
		if err != nil {
			return nil, "", err
		}
	}
	return urls, mask, nil
}

func selectImageFiles(form *multipart.Form) []*multipart.FileHeader {
	if files := form.File["image"]; len(files) > 0 {
		return files
	}
	if files := form.File["image[]"]; len(files) > 0 {
		return files
	}
	indexed := make([]struct {
		index int
		file  *multipart.FileHeader
	}, 0)
	for key, files := range form.File {
		if !strings.HasPrefix(key, "image[") || !strings.HasSuffix(key, "]") {
			continue
		}
		index, err := strconv.Atoi(strings.TrimSuffix(strings.TrimPrefix(key, "image["), "]"))
		if err != nil || index < 0 {
			continue
		}
		for _, file := range files {
			indexed = append(indexed, struct {
				index int
				file  *multipart.FileHeader
			}{index, file})
		}
	}
	sort.SliceStable(indexed, func(i, j int) bool { return indexed[i].index < indexed[j].index })
	files := make([]*multipart.FileHeader, 0, len(indexed))
	for _, item := range indexed {
		files = append(files, item.file)
	}
	return files
}

func uploadImage(c *gin.Context, info *relaycommon.RelayInfo, header *multipart.FileHeader) (string, error) {
	if header.Size > maxUploadImageBytes {
		return "", invalidRequest(fmt.Errorf("APIMart image %q exceeds 20 MiB", header.Filename))
	}
	file, err := header.Open()
	if err != nil {
		return "", err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxUploadImageBytes+1))
	if err != nil {
		return "", err
	}
	if len(data) > maxUploadImageBytes || !isSupportedImage(data) {
		return "", invalidRequest(fmt.Errorf("APIMart image %q must be JPEG, PNG, GIF, or WebP and at most 20 MiB", header.Filename))
	}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", filepath.Base(header.Filename))
	if err != nil {
		return "", err
	}
	if _, err = part.Write(data); err != nil {
		return "", err
	}
	if err = writer.Close(); err != nil {
		return "", err
	}
	url := relaycommon.GetFullRequestURL(info.ChannelBaseUrl, "/v1/uploads/images", info.ChannelType)
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, url, &body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+info.ApiKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Accept", "application/json")
	resp, err := channel.DoRequest(c, req, info)
	if err != nil {
		return "", err
	}
	defer service.CloseResponseBodyGracefully(resp)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return "", fmt.Errorf("APIMart image upload returned status %d", resp.StatusCode)
	}
	var uploaded uploadResponse
	if err := common.DecodeJson(resp.Body, &uploaded); err != nil {
		return "", err
	}
	if uploaded.Error != nil || uploaded.URL == "" {
		return "", fmt.Errorf("APIMart image upload failed: %s", errorMessage(uploaded.Error))
	}
	return uploaded.URL, nil
}

func isSupportedImage(data []byte) bool {
	if len(data) < 10 {
		return false
	}
	return bytes.HasPrefix(data, []byte{0xff, 0xd8, 0xff}) || bytes.HasPrefix(data, []byte("\x89PNG\r\n\x1a\n")) || bytes.HasPrefix(data, []byte("GIF87a")) || bytes.HasPrefix(data, []byte("GIF89a")) || (bytes.HasPrefix(data, []byte("RIFF")) && string(data[8:12]) == "WEBP")
}

func downloadImageBase64(c *gin.Context, info *relaycommon.RelayInfo, url string) (string, error) {
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	resp, err := channel.DoRequest(c, req, info)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK || !strings.HasPrefix(strings.ToLower(resp.Header.Get("Content-Type")), "image/") {
		return "", errors.New("APIMart image download did not return image content")
	}
	if resp.ContentLength > maxDownloadImageBytes {
		return "", errors.New("APIMart image download exceeds 50 MiB")
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxDownloadImageBytes+1))
	if err != nil || len(data) > maxDownloadImageBytes {
		return "", errors.New("APIMart image download exceeds 50 MiB")
	}
	return base64.StdEncoding.EncodeToString(data), nil
}

func invalidRequest(err error) *types.NewAPIError {
	return types.NewErrorWithStatusCode(err, types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
}

func upstreamError(prefix string, apiErr *apiError) *types.NewAPIError {
	return types.NewError(fmt.Errorf("%s: %s", prefix, errorMessage(apiErr)), types.ErrorCodeBadResponse)
}

func errorMessage(apiErr *apiError) string {
	if apiErr != nil && apiErr.Message != "" {
		return apiErr.Message
	}
	return "upstream returned an invalid response"
}

func (a *Adaptor) GetModelList() []string { return ModelList }
func (a *Adaptor) GetChannelName() string { return ChannelName }
func (a *Adaptor) ConvertOpenAIRequest(*gin.Context, *relaycommon.RelayInfo, *dto.GeneralOpenAIRequest) (any, error) {
	return nil, errors.New("APIMart only supports images")
}
func (a *Adaptor) ConvertRerankRequest(*gin.Context, int, dto.RerankRequest) (any, error) {
	return nil, errors.New("APIMart only supports images")
}
func (a *Adaptor) ConvertEmbeddingRequest(*gin.Context, *relaycommon.RelayInfo, dto.EmbeddingRequest) (any, error) {
	return nil, errors.New("APIMart only supports images")
}
func (a *Adaptor) ConvertAudioRequest(*gin.Context, *relaycommon.RelayInfo, dto.AudioRequest) (io.Reader, error) {
	return nil, errors.New("APIMart only supports images")
}
func (a *Adaptor) ConvertOpenAIResponsesRequest(*gin.Context, *relaycommon.RelayInfo, dto.OpenAIResponsesRequest) (any, error) {
	return nil, errors.New("APIMart only supports images")
}
func (a *Adaptor) ConvertClaudeRequest(*gin.Context, *relaycommon.RelayInfo, *dto.ClaudeRequest) (any, error) {
	return nil, errors.New("APIMart only supports images")
}
func (a *Adaptor) ConvertGeminiRequest(*gin.Context, *relaycommon.RelayInfo, *dto.GeminiChatRequest) (any, error) {
	return nil, errors.New("APIMart only supports images")
}
