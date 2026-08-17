package apimart

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDoResponseRejectsMissingTaskID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	response := &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewBufferString(`{"code":200,"data":[]}`))}

	_, apiErr := (&Adaptor{}).DoResponse(c, response, &relaycommon.RelayInfo{})
	require.NotNil(t, apiErr)
	assert.Equal(t, http.StatusInternalServerError, apiErr.StatusCode)
}

func TestFetchTaskRejectsNonSuccessAndMalformedResponses(t *testing.T) {
	gin.SetMode(gin.TestMode)
	tests := []struct {
		name   string
		status int
		body   string
	}{
		{name: "non success", status: http.StatusBadGateway, body: `{"error":{"message":"upstream unavailable"}}`},
		{name: "malformed json", status: http.StatusOK, body: `{`},
		{name: "upstream error", status: http.StatusOK, body: `{"error":{"message":"task unavailable"}}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				require.Equal(t, "/v1/tasks/task-sample", r.URL.Path)
				w.WriteHeader(tt.status)
				_, _ = w.Write([]byte(tt.body))
			}))
			defer upstream.Close()
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
			_, apiErr := fetchTask(c, newAPIMartRelayInfo(upstream.URL, &dto.ImageRequest{}), "task-sample")
			require.NotNil(t, apiErr)
		})
	}
}

func TestWriteImageResponseRejectsMissingImageAndInvalidBase64Download(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Run("missing image", func(t *testing.T) {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
		_, apiErr := writeImageResponse(c, &relaycommon.RelayInfo{}, &taskData{})
		require.NotNil(t, apiErr)
		assert.Equal(t, http.StatusInternalServerError, apiErr.StatusCode)
	})
	t.Run("non image response", func(t *testing.T) {
		upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "text/plain")
			_, _ = w.Write([]byte("not an image"))
		}))
		defer upstream.Close()
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
		request := &dto.ImageRequest{ResponseFormat: "b64_json"}
		task := &taskData{}
		task.Result.Images = []struct {
			URL []string `json:"url"`
		}{{URL: []string{upstream.URL}}}
		_, apiErr := writeImageResponse(c, newAPIMartRelayInfo(upstream.URL, request), task)
		require.NotNil(t, apiErr)
		assert.Equal(t, http.StatusBadGateway, apiErr.StatusCode)
	})
}
