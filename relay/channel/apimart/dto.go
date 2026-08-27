package apimart

import "encoding/json"

type imageRequest struct {
	Model             string   `json:"model"`
	Prompt            string   `json:"prompt"`
	Size              string   `json:"size,omitempty"`
	AspectRatio       string   `json:"aspect_ratio,omitempty"`
	Resolution        string   `json:"resolution,omitempty"`
	Quality           string   `json:"quality,omitempty"`
	N                 *uint    `json:"n,omitempty"`
	Background        *string  `json:"background,omitempty"`
	Moderation        *string  `json:"moderation,omitempty"`
	OutputFormat      *string  `json:"output_format,omitempty"`
	OutputCompression *int     `json:"output_compression,omitempty"`
	ImageURLs         []string `json:"image_urls,omitempty"`
	MaskURL           string   `json:"mask_url,omitempty"`
}

type submitResponse struct {
	Code  int             `json:"code"`
	Data  json.RawMessage `json:"data"`
	Error *apiError       `json:"error"`
}

type submitTask struct {
	ID     string `json:"id"`
	TaskID string `json:"task_id"`
}

type taskResponse struct {
	Code  int       `json:"code"`
	Data  taskData  `json:"data"`
	Error *apiError `json:"error"`
}

type taskData struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	Result struct {
		Images []struct {
			URL []string `json:"url"`
		} `json:"images"`
	} `json:"result"`
	Usage struct {
		InputTokens        int `json:"input_tokens"`
		OutputTokens       int `json:"output_tokens"`
		TotalTokens        int `json:"total_tokens"`
		InputTokensDetails struct {
			CachedTokens int `json:"cached_tokens"`
			TextTokens   int `json:"text_tokens"`
			ImageTokens  int `json:"image_tokens"`
		} `json:"input_tokens_details"`
		OutputTokensDetails struct {
			TextTokens  int `json:"text_tokens"`
			ImageTokens int `json:"image_tokens"`
		} `json:"output_tokens_details"`
	} `json:"usage"`
	Error *apiError `json:"error"`
}

type uploadResponse struct {
	URL   string    `json:"url"`
	Error *apiError `json:"error"`
}

type apiError struct {
	Code    any    `json:"code"`
	Message string `json:"message"`
	Type    string `json:"type"`
}
