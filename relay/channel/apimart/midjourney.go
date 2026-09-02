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

type midjourneyTaskData struct {
	ID           string                 `json:"id"`
	Status       string                 `json:"status"`
	Progress     json.RawMessage        `json:"progress"`
	PromptEn     string                 `json:"prompt_en"`
	CreatedAt    int64                  `json:"created_at"`
	FinishedAt   int64                  `json:"finished_at"`
	GridImageURL string                 `json:"grid_image_url"`
	ImageURLs    []string               `json:"image_urls"`
	Buttons      []midjourneyTaskButton `json:"buttons"`
	Error        *apiError              `json:"error"`
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
	PromptEn     string
	CreatedAt    int64
	FinishedAt   int64
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
	var data midjourneyTaskData
	if err := common.DecodeJson(resp.Body, &data); err != nil {
		return nil, err
	}
	if data.Error != nil {
		return nil, errors.New("midjourney task query failed")
	}
	if strings.TrimSpace(data.ID) == "" || strings.TrimSpace(data.Status) == "" {
		return nil, errors.New("midjourney task query returned invalid data")
	}
	progress := ""
	if len(data.Progress) > 0 && string(data.Progress) != "null" {
		if common.GetJsonType(data.Progress) == "string" {
			_ = common.Unmarshal(data.Progress, &progress)
		} else {
			var value float64
			if common.Unmarshal(data.Progress, &value) == nil {
				progress = fmt.Sprintf("%g%%", value)
			}
		}
	}
	buttons := make([]taskdto.ActionButton, 0, len(data.Buttons))
	for _, button := range data.Buttons {
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
		TaskID:       data.ID,
		Status:       data.Status,
		Progress:     progress,
		PromptEn:     data.PromptEn,
		CreatedAt:    data.CreatedAt,
		FinishedAt:   data.FinishedAt,
		GridImageURL: data.GridImageURL,
		ImageURLs:    data.ImageURLs,
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
