package relay

import (
	"net/http"
	"net/http/httptest"
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

func TestImageHelperLetsAPIMartAcceptedResponseReachAdapter(t *testing.T) {
	service.InitHttpClient()
	gin.SetMode(gin.TestMode)
	var taskQueries atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/images/generations":
			w.WriteHeader(http.StatusAccepted)
			_, _ = w.Write([]byte(`{"code":202,"data":{"id":"task-grok","status":"pending"}}`))
		case "/v1/tasks/task-grok":
			taskQueries.Add(1)
			_, _ = w.Write([]byte(`{"code":200,"data":{"id":"task-grok","status":"failed","error":{"message":"sample failure"}}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	c.Request.Header.Set("Content-Type", "application/json")
	common.SetContextKey(c, constant.ContextKeyChannelType, constant.ChannelTypeAPIMart)
	common.SetContextKey(c, constant.ContextKeyChannelBaseUrl, upstream.URL)
	common.SetContextKey(c, constant.ContextKeyChannelKey, "sk-test")
	common.SetContextKey(c, constant.ContextKeyOriginalModel, dto.APIMartGrokImagineModel)

	n := uint(1)
	info := &relaycommon.RelayInfo{
		OriginModelName: dto.APIMartGrokImagineModel,
		RelayMode:       relayconstant.RelayModeImagesGenerations,
		Request: &dto.ImageRequest{
			Model:  dto.APIMartGrokImagineModel,
			Prompt: "test",
			N:      &n,
		},
	}

	apiErr := ImageHelper(c, info)
	require.NotNil(t, apiErr)
	assert.Contains(t, apiErr.Error(), "sample failure")
	assert.EqualValues(t, 1, taskQueries.Load())
}
