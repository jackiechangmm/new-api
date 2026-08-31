package apimart

import (
	"strings"
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUnsupportedEndpointsDoNotExposeChannelName(t *testing.T) {
	_, err := (&Adaptor{}).ConvertOpenAIRequest(nil, &relaycommon.RelayInfo{}, &dto.GeneralOpenAIRequest{})

	require.EqualError(t, err, "this channel only supports image generation")
	assert.NotContains(t, strings.ToLower(err.Error()), "apimart")
}

func TestImageValidationDoesNotExposeChannelName(t *testing.T) {
	stream := true
	request := dto.ImageRequest{Model: dto.APIMartImageModel, Stream: &stream}

	_, err := (&Adaptor{}).ConvertImageRequest(&gin.Context{}, &relaycommon.RelayInfo{}, request)

	require.EqualError(t, err, "image streaming is not supported")
	assert.NotContains(t, strings.ToLower(err.Error()), "apimart")
}

func TestUpstreamErrorDoesNotExposeResponseMessage(t *testing.T) {
	apiErr := upstreamError("image generation task failed", &apiError{Message: "APIMart request failed"})

	require.EqualError(t, apiErr, "image generation request failed")
	assert.NotContains(t, strings.ToLower(apiErr.Error()), "apimart")
}
