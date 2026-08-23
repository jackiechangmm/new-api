package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSetPlaygroundRelayTokenNameUsesActualGroup(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())

	setPlaygroundRelayTokenName(ctx, "vip")

	assert.Equal(t, "playground-vip", ctx.GetString("token_name"))
}

func TestGetModelRequestKeepsSessionGroupWhenRequestOmitsGroup(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"gpt-test","messages":[]}`))
	ctx.Request.Header.Set("Content-Type", "application/json")
	common.SetContextKey(ctx, constant.ContextKeyRelayIsPlayground, true)
	common.SetContextKey(ctx, constant.ContextKeyTokenGroup, "default")

	modelRequest, _, err := getModelRequest(ctx)
	require.NoError(t, err)
	assert.Equal(t, "gpt-test", modelRequest.Model)
	assert.Empty(t, modelRequest.Group)
	assert.Equal(t, "default", common.GetContextKeyString(ctx, constant.ContextKeyTokenGroup))
}

func TestGetModelRequestUsesGroupForSessionRelay(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"gpt-test","group":"vip","messages":[]}`))
	ctx.Request.Header.Set("Content-Type", "application/json")
	common.SetContextKey(ctx, constant.ContextKeyRelayIsPlayground, true)
	common.SetContextKey(ctx, constant.ContextKeyUserGroup, "default")

	modelRequest, _, err := getModelRequest(ctx)
	require.NoError(t, err)
	assert.Equal(t, "gpt-test", modelRequest.Model)
	assert.Equal(t, "vip", modelRequest.Group)
	assert.Equal(t, "vip", common.GetContextKeyString(ctx, constant.ContextKeyTokenGroup))
}
