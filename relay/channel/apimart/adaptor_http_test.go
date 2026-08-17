package apimart

import (
	"bytes"
	"encoding/base64"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func readAPIMartFixture(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile("testdata/" + name)
	require.NoError(t, err)
	return data
}

func newAPIMartRelayInfo(baseURL string, request *dto.ImageRequest) *relaycommon.RelayInfo {
	return &relaycommon.RelayInfo{
		Request: request,
		ChannelMeta: &relaycommon.ChannelMeta{
			ApiKey:         "sk-sample",
			ChannelBaseUrl: baseURL,
			ChannelType:    constant.ChannelTypeAPIMart,
		},
	}
}

func TestDoResponsePollsSampledTaskUntilCompleted(t *testing.T) {
	service.InitHttpClient()
	gin.SetMode(gin.TestMode)
	submit := readAPIMartFixture(t, "generation-submit.json")
	pending := readAPIMartFixture(t, "generation-pending.json")
	completed := readAPIMartFixture(t, "generation-completed.json")
	var taskRequests atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "Bearer sk-sample", r.Header.Get("Authorization"))
		switch r.URL.Path {
		case "/v1/tasks/task-sample-generation":
			if taskRequests.Add(1) == 1 {
				_, _ = w.Write(pending)
				return
			}
			_, _ = w.Write(completed)
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()

	n := uint(1)
	request := &dto.ImageRequest{Model: dto.APIMartImageModel, Size: "3:4", Quality: "low", N: &n, ResponseFormat: "url"}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	response := &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(submit))}

	usage, apiErr := (&Adaptor{}).DoResponse(c, response, newAPIMartRelayInfo(upstream.URL, request))
	require.Nil(t, apiErr)
	result, ok := usage.(*dto.Usage)
	require.True(t, ok)
	assert.Equal(t, 19, result.PromptTokens)
	assert.Equal(t, 19, result.PromptTokensDetails.TextTokens)
	assert.Equal(t, 134, result.CompletionTokens)
	assert.Equal(t, 134, result.CompletionTokenDetails.ImageTokens)
	assert.Equal(t, 153, result.TotalTokens)
	assert.EqualValues(t, 2, taskRequests.Load())
	var imageResponse dto.ImageResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &imageResponse))
	require.Len(t, imageResponse.Data, 1)
	assert.Equal(t, "https://example.test/apimart-generation.png", imageResponse.Data[0].Url)
}

func TestConvertImageRequestUploadsSampledImageAndMask(t *testing.T) {
	service.InitHttpClient()
	gin.SetMode(gin.TestMode)
	imageUpload := readAPIMartFixture(t, "upload-image.json")
	maskUpload := readAPIMartFixture(t, "upload-mask.json")
	var uploads atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "/v1/uploads/images", r.URL.Path)
		require.Equal(t, "Bearer sk-sample", r.Header.Get("Authorization"))
		require.NoError(t, r.ParseMultipartForm(1<<20))
		file, _, err := r.FormFile("file")
		require.NoError(t, err)
		defer file.Close()
		_, err = io.ReadAll(file)
		require.NoError(t, err)
		if uploads.Add(1) == 1 {
			_, _ = w.Write(imageUpload)
			return
		}
		_, _ = w.Write(maskUpload)
	}))
	defer upstream.Close()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	image, err := writer.CreateFormFile("image", "reference.png")
	require.NoError(t, err)
	_, err = image.Write([]byte("\x89PNG\r\n\x1a\nxx"))
	require.NoError(t, err)
	mask, err := writer.CreateFormFile("mask", "mask.png")
	require.NoError(t, err)
	_, err = mask.Write([]byte("\x89PNG\r\n\x1a\nxx"))
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/edits", &body)
	c.Request.Header.Set("Content-Type", writer.FormDataContentType())
	require.NoError(t, c.Request.ParseMultipartForm(1<<20))
	n := uint(1)
	request := dto.ImageRequest{Model: dto.APIMartImageModel, Prompt: "为人物加上迪迦奥特曼面具", Size: "1:1", Quality: "low", N: &n}
	info := newAPIMartRelayInfo(upstream.URL, &request)
	info.RelayMode = relayconstant.RelayModeImagesEdits

	converted, err := (&Adaptor{}).ConvertImageRequest(c, info, request)
	require.NoError(t, err)
	result, ok := converted.(*imageRequest)
	require.True(t, ok)
	assert.Equal(t, []string{"https://example.test/apimart-upload-image.png"}, result.ImageURLs)
	assert.Equal(t, "https://example.test/apimart-upload-mask.png", result.MaskURL)
	assert.EqualValues(t, 2, uploads.Load())
}

func TestWriteImageResponsePreservesSampledUsageDetails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var sampled taskResponse
	require.NoError(t, common.Unmarshal(readAPIMartFixture(t, "edit-completed.json"), &sampled))
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/edits", nil)
	request := &dto.ImageRequest{Model: dto.APIMartImageModel, ResponseFormat: "url"}

	usage, apiErr := writeImageResponse(c, newAPIMartRelayInfo("https://example.test", request), &sampled.Data)
	require.Nil(t, apiErr)
	result := usage.(*dto.Usage)
	assert.Equal(t, 1042, result.PromptTokens)
	assert.Equal(t, 18, result.PromptTokensDetails.TextTokens)
	assert.Equal(t, 1024, result.PromptTokensDetails.ImageTokens)
	assert.Equal(t, 196, result.CompletionTokens)
	assert.Equal(t, 196, result.CompletionTokenDetails.ImageTokens)
}
func TestWriteImageResponseDownloadsBase64Image(t *testing.T) {
	service.InitHttpClient()
	gin.SetMode(gin.TestMode)
	image := []byte("\x89PNG\r\n\x1a\nimage")
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/image.png", r.URL.Path)
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(image)
	}))
	defer upstream.Close()

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	request := &dto.ImageRequest{Model: dto.APIMartImageModel, ResponseFormat: "b64_json"}
	task := &taskData{}
	task.Result.Images = []struct {
		URL []string `json:"url"`
	}{{URL: []string{upstream.URL + "/image.png"}}}
	task.Usage.OutputTokens = 134
	task.Usage.TotalTokens = 134

	_, apiErr := writeImageResponse(c, newAPIMartRelayInfo(upstream.URL, request), task)
	require.Nil(t, apiErr)
	var response dto.ImageResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.Len(t, response.Data, 1)
	decoded, err := base64.StdEncoding.DecodeString(response.Data[0].B64Json)
	require.NoError(t, err)
	assert.Equal(t, image, decoded)
}
