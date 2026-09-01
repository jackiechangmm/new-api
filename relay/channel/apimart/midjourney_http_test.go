package apimart

import (
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSubmitMidjourneyImagineUploadsReferencesAndPreservesPrompt(t *testing.T) {
	service.InitHttpClient()
	gin.SetMode(gin.TestMode)
	var uploads atomic.Int32
	var submissions atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "Bearer sk-sample", r.Header.Get("Authorization"))
		switch r.URL.Path {
		case "/v1/uploads/images":
			require.Equal(t, http.MethodPost, r.Method)
			require.NoError(t, r.ParseMultipartForm(maxUploadImageBytes))
			file, _, err := r.FormFile("file")
			require.NoError(t, err)
			defer file.Close()
			data, err := io.ReadAll(file)
			require.NoError(t, err)
			assert.Equal(t, []byte("\x89PNG\r\n\x1a\nxx"), data)
			index := uploads.Add(1)
			_, _ = w.Write([]byte(`{"url":"https://example.test/reference-` + string(rune('0'+index)) + `.png"}`))
		case "/v1/midjourney/generations":
			require.Equal(t, http.MethodPost, r.Method)
			body, err := io.ReadAll(r.Body)
			require.NoError(t, err)
			assert.JSONEq(t, `{"prompt":"turbo train --ar 16:9","image_urls":["https://example.test/reference-1.png","https://example.test/reference-2.png"]}`, string(body))
			assert.NotContains(t, string(body), `"model"`)
			submissions.Add(1)
			_, _ = w.Write(readAPIMartFixture(t, "midjourney-submit.json"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/mj/submit/imagine", nil)
	info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{
		ApiKey:         "sk-sample",
		ChannelBaseUrl: upstream.URL,
		ChannelType:    constant.ChannelTypeAPIMart,
	}}
	image := []byte("\x89PNG\r\n\x1a\nxx")
	references := []string{
		"data:image/png;base64," + base64.StdEncoding.EncodeToString(image),
		base64.StdEncoding.EncodeToString(image),
	}

	taskID, err := SubmitMidjourneyImagine(c, info, "turbo train --ar 16:9", references)
	require.NoError(t, err)
	assert.Equal(t, "mj-task-sample", taskID)
	assert.EqualValues(t, 2, uploads.Load())
	assert.EqualValues(t, 1, submissions.Load())
}

func TestFetchMidjourneyTaskMapsResult(t *testing.T) {
	service.InitHttpClient()
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodGet, r.Method)
		require.Equal(t, "/v1/midjourney/mj-task-sample", r.URL.Path)
		require.Equal(t, "Bearer sk-sample", r.Header.Get("Authorization"))
		_, _ = w.Write(readAPIMartFixture(t, "midjourney-success.json"))
	}))
	defer upstream.Close()

	result, err := FetchMidjourneyTask(t.Context(), upstream.URL, "sk-sample", "mj-task-sample")
	require.NoError(t, err)
	assert.Equal(t, "mj-task-sample", result.TaskID)
	assert.Equal(t, "SUCCESS", result.Status)
	assert.Equal(t, "100%", result.Progress)
	assert.Equal(t, "https://example.test/mj-grid.png", result.GridImageURL)
	assert.Equal(t, []string{"https://example.test/mj-1.png", "https://example.test/mj-2.png"}, result.ImageURLs)
	require.Len(t, result.Buttons, 1)
	assert.Equal(t, "MJ::JOB::upsample::1::mj-task-sample", result.Buttons[0].CustomId)
}

func TestValidateMidjourneyImagineRejectsTurboParameters(t *testing.T) {
	tests := []struct {
		name    string
		prompt  string
		speed   string
		wantErr bool
	}{
		{name: "structured", prompt: "cat", speed: "turbo", wantErr: true},
		{name: "structured case insensitive", prompt: "cat", speed: "TuRbO", wantErr: true},
		{name: "turbo flag", prompt: "cat --turbo", wantErr: true},
		{name: "speed argument", prompt: "cat --speed turbo", wantErr: true},
		{name: "speed assignment", prompt: "cat --speed=turbo", wantErr: true},
		{name: "ordinary word", prompt: "turbo train", wantErr: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateMidjourneyImagine(tt.prompt, tt.speed, 0)
			if tt.wantErr {
				require.Error(t, err)
				assert.NotContains(t, strings.ToLower(err.Error()), "apimart")
				return
			}
			require.NoError(t, err)
		})
	}
}

func TestDecodeMidjourneyReferenceValidation(t *testing.T) {
	validImages := map[string][]byte{
		"jpeg": append([]byte{0xff, 0xd8, 0xff}, make([]byte, 7)...),
		"png":  []byte("\x89PNG\r\n\x1a\nxx"),
		"gif":  []byte("GIF89a1234"),
		"webp": []byte("RIFFxx00WEBP"),
	}
	for name, image := range validImages {
		t.Run(name+" raw", func(t *testing.T) {
			decoded, err := decodeMidjourneyReference(base64.StdEncoding.EncodeToString(image))
			require.NoError(t, err)
			assert.Equal(t, image, decoded)
		})
		t.Run(name+" data URI", func(t *testing.T) {
			decoded, err := decodeMidjourneyReference("data:image/" + name + ";base64," + base64.StdEncoding.EncodeToString(image))
			require.NoError(t, err)
			assert.Equal(t, image, decoded)
		})
	}

	boundary := make([]byte, maxUploadImageBytes)
	copy(boundary, []byte("\x89PNG\r\n\x1a\n"))
	decoded, err := decodeMidjourneyReference(base64.StdEncoding.EncodeToString(boundary))
	require.NoError(t, err)
	assert.Len(t, decoded, maxUploadImageBytes)

	invalid := []string{
		"",
		"not-base64!",
		base64.StdEncoding.EncodeToString([]byte("plain text")),
		base64.StdEncoding.EncodeToString(append(boundary, 0)),
	}
	for _, reference := range invalid {
		_, err := decodeMidjourneyReference(reference)
		require.Error(t, err)
	}
}

func TestValidateMidjourneyImagineRejectsTooManyReferences(t *testing.T) {
	require.NoError(t, ValidateMidjourneyImagine("cat", "", maxMidjourneyReferenceImages))
	require.Error(t, ValidateMidjourneyImagine("cat", "", maxMidjourneyReferenceImages+1))
}

func TestSubmitMidjourneyImagineReturnsGenericError(t *testing.T) {
	service.InitHttpClient()
	gin.SetMode(gin.TestMode)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(`{"error":{"message":"sample failure at /v1/midjourney/generations"}}`))
	}))
	defer upstream.Close()

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/mj/submit/imagine", nil)
	info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ApiKey: "sk-sample", ChannelBaseUrl: upstream.URL}}
	_, err := SubmitMidjourneyImagine(c, info, "cat", nil)
	require.Error(t, err)
	assert.Equal(t, "midjourney request failed", err.Error())
	assert.NotContains(t, strings.ToLower(err.Error()), "sample failure")
	assert.NotContains(t, strings.ToLower(err.Error()), "midjourney/generations")
}
