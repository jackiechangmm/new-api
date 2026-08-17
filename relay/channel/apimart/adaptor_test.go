package apimart

import (
	"context"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConvertImageRequestUsesControlledSize(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeImagesGenerations, ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: ModelName}}
	n := uint(2)
	request := dto.ImageRequest{Model: dto.APIMartImageModel, Prompt: "a poster", Size: "3840x2160", Quality: "high", N: &n}

	converted, err := (&Adaptor{}).ConvertImageRequest(c, info, request)
	require.NoError(t, err)
	body, ok := converted.(*imageRequest)
	require.True(t, ok)
	assert.Equal(t, ModelName, body.Model)
	assert.Equal(t, "16:9", body.Size)
	assert.Equal(t, "4k", body.Resolution)
	assert.Equal(t, "high", body.Quality)
}

func TestWriteImageResponseUsesActualImageCountAndFallbackUsage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	n := uint(3)
	request := &dto.ImageRequest{Model: dto.APIMartImageModel, Size: "1:1", Quality: "low", N: &n}
	info := &relaycommon.RelayInfo{Request: request}
	info.PriceData.UsePrice = true
	task := &taskData{}
	task.Result.Images = []struct {
		URL []string `json:"url"`
	}{{URL: []string{"https://example.test/one.png", "https://example.test/ignored.png"}}, {URL: []string{"https://example.test/two.png"}}}
	task.Usage.TotalTokens = -1

	usage, apiErr := writeImageResponse(c, info, task)
	require.Nil(t, apiErr)
	require.Equal(t, 196*3, usage.(*dto.Usage).CompletionTokens)
	assert.Equal(t, 2.0, info.PriceData.OtherRatios()["n"])
	assert.Equal(t, http.StatusOK, recorder.Code)
	var response dto.ImageResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.Len(t, response.Data, 2)
	assert.Equal(t, "https://example.test/one.png", response.Data[0].Url)
	assert.Equal(t, "https://example.test/two.png", response.Data[1].Url)
}

func TestDoResponseHonorsCancelledRequestContext(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil).WithContext(ctx)
	response := &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`{"code":200,"data":[{"task_id":"task_1"}]}`))}

	_, apiErr := (&Adaptor{}).DoResponse(c, response, &relaycommon.RelayInfo{})
	require.NotNil(t, apiErr)
	assert.Equal(t, http.StatusGatewayTimeout, apiErr.StatusCode)
}

func TestSelectImageFilesHonorsFieldPriorityAndIndexOrder(t *testing.T) {
	form := &multipart.Form{File: map[string][]*multipart.FileHeader{
		"image[10]": {{Filename: "ten.png"}},
		"image[2]":  {{Filename: "two.png"}},
		"image[]":   {{Filename: "array.png"}},
	}}
	files := selectImageFiles(form)
	require.Len(t, files, 1)
	assert.Equal(t, "array.png", files[0].Filename)

	delete(form.File, "image[]")
	files = selectImageFiles(form)
	require.Len(t, files, 2)
	assert.Equal(t, "two.png", files[0].Filename)
	assert.Equal(t, "ten.png", files[1].Filename)
}
