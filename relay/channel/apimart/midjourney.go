package apimart

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"
	taskdto "github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/relay/channel"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

const maxMidjourneyReferenceImages = 16

type midjourneyImagineRequest struct {
	Prompt    string   `json:"prompt"`
	ImageURLs []string `json:"image_urls,omitempty"`
}

type midjourneyTaskResponse struct {
	Code  int                `json:"code"`
	Data  midjourneyTaskData `json:"data"`
	Error *apiError          `json:"error"`
}

type midjourneyTaskData struct {
	ID       string          `json:"id"`
	TaskID   string          `json:"task_id"`
	Status   string          `json:"status"`
	Progress json.RawMessage `json:"progress"`
	Result   struct {
		GridImageURL string                 `json:"grid_image_url"`
		ImageURLs    []string               `json:"image_urls"`
		Buttons      []midjourneyTaskButton `json:"buttons"`
	} `json:"result"`
}

type midjourneyTaskButton struct {
	CustomID       any `json:"custom_id"`
	LegacyCustomID any `json:"customId"`
	Emoji          any `json:"emoji"`
	Label          any `json:"label"`
	Type           any `json:"type"`
	Style          any `json:"style"`
}

type MidjourneyTask struct {
	TaskID       string
	Status       string
	Progress     string
	GridImageURL string
	ImageURLs    []string
	Buttons      []taskdto.ActionButton
}

func ValidateMidjourneyImagine(prompt, speed string, referenceCount int) error {
	if strings.TrimSpace(prompt) == "" {
		return errors.New("prompt_is_required")
	}
	if referenceCount > maxMidjourneyReferenceImages {
		return fmt.Errorf("base64Array allows at most %d images", maxMidjourneyReferenceImages)
	}
	if strings.EqualFold(strings.TrimSpace(speed), "turbo") {
		return errors.New("turbo speed is not supported")
	}
	fields := strings.Fields(strings.ToLower(prompt))
	for i, field := range fields {
		if field == "--turbo" || field == "--speed=turbo" || (field == "--speed" && i+1 < len(fields) && fields[i+1] == "turbo") {
			return errors.New("turbo speed is not supported")
		}
	}
	return nil
}

func SubmitMidjourneyImagine(c *gin.Context, info *relaycommon.RelayInfo, prompt string, references []string) (string, error) {
	urls := make([]string, 0, len(references))
	for _, reference := range references {
		data, err := decodeMidjourneyReference(reference)
		if err != nil {
			return "", err
		}
		url, err := uploadImageData(c, info, "reference-image", data)
		if err != nil {
			logger.LogError(c, "Midjourney reference image upload failed: "+err.Error())
			return "", errors.New("midjourney request failed")
		}
		urls = append(urls, url)
	}

	body, err := common.Marshal(midjourneyImagineRequest{Prompt: prompt, ImageURLs: urls})
	if err != nil {
		return "", errors.New("midjourney request failed")
	}
	url := relaycommon.GetFullRequestURL(info.ChannelBaseUrl, "/v1/midjourney/generations", info.ChannelType)
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", errors.New("midjourney request failed")
	}
	req.Header.Set("Authorization", "Bearer "+info.ApiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := channel.DoRequest(c, req, info)
	if err != nil {
		logger.LogError(c, "Midjourney task submission failed: "+err.Error())
		return "", errors.New("midjourney request failed")
	}
	defer service.CloseResponseBodyGracefully(resp)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusAccepted {
		logger.LogError(c, fmt.Sprintf("Midjourney task submission returned status %d", resp.StatusCode))
		return "", errors.New("midjourney request failed")
	}
	var submitted submitResponse
	if err := common.DecodeJson(resp.Body, &submitted); err != nil {
		logger.LogError(c, "Midjourney task submission response decode failed: "+err.Error())
		return "", errors.New("midjourney request failed")
	}
	if submitted.Error != nil {
		logger.LogError(c, "Midjourney task submission returned an upstream error")
		return "", errors.New("midjourney request failed")
	}
	taskID, err := submitted.taskID()
	if err != nil {
		logger.LogError(c, "Midjourney task submission returned no task ID: "+err.Error())
		return "", errors.New("midjourney request failed")
	}
	return taskID, nil
}

func FetchMidjourneyTask(ctx context.Context, baseURL, apiKey, taskID string) (*MidjourneyTask, error) {
	endpoint := strings.TrimRight(baseURL, "/") + "/v1/midjourney/" + url.PathEscape(taskID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Accept", "application/json")
	resp, err := service.GetHttpClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer service.CloseResponseBodyGracefully(resp)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("midjourney task query returned status %d", resp.StatusCode)
	}
	var response midjourneyTaskResponse
	if err := common.DecodeJson(resp.Body, &response); err != nil {
		return nil, err
	}
	if response.Error != nil {
		return nil, errors.New("midjourney task query failed")
	}
	progress := ""
	if len(response.Data.Progress) > 0 && string(response.Data.Progress) != "null" {
		if common.GetJsonType(response.Data.Progress) == "string" {
			_ = common.Unmarshal(response.Data.Progress, &progress)
		} else {
			var value float64
			if common.Unmarshal(response.Data.Progress, &value) == nil {
				progress = fmt.Sprintf("%g%%", value)
			}
		}
	}
	id := response.Data.TaskID
	if id == "" {
		id = response.Data.ID
	}
	buttons := make([]taskdto.ActionButton, 0, len(response.Data.Result.Buttons))
	for _, button := range response.Data.Result.Buttons {
		customID := button.CustomID
		if customID == nil {
			customID = button.LegacyCustomID
		}
		buttons = append(buttons, taskdto.ActionButton{
			CustomId: customID,
			Emoji:    button.Emoji,
			Label:    button.Label,
			Type:     button.Type,
			Style:    button.Style,
		})
	}
	return &MidjourneyTask{
		TaskID:       id,
		Status:       response.Data.Status,
		Progress:     progress,
		GridImageURL: response.Data.Result.GridImageURL,
		ImageURLs:    response.Data.Result.ImageURLs,
		Buttons:      buttons,
	}, nil
}

func decodeMidjourneyReference(reference string) ([]byte, error) {
	encoded := strings.TrimSpace(reference)
	if comma := strings.IndexByte(encoded, ','); strings.HasPrefix(strings.ToLower(encoded), "data:") && comma >= 0 {
		encoded = encoded[comma+1:]
	}
	if encoded == "" || len(encoded) > (maxUploadImageBytes+2)/3*4+4 {
		return nil, errors.New("invalid reference image")
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		data, err = base64.RawStdEncoding.DecodeString(encoded)
	}
	if err != nil || len(data) == 0 || len(data) > maxUploadImageBytes || !isSupportedImage(data) {
		return nil, errors.New("invalid reference image")
	}
	return data, nil
}
