package router

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func createRelaySession(t *testing.T, username string) (*model.User, *model.UserSession, string) {
	t.Helper()
	user := &model.User{
		Username: username, Status: common.UserStatusEnabled, Group: "default", Quota: 100, AuthVersion: 1,
		AffCode: "aff-" + username,
	}
	require.NoError(t, model.DB.Create(user).Error)
	now := time.Now().Unix()
	session := &model.UserSession{
		SID: "relay-session-" + username, UserID: user.Id, Version: 1, UserAuthVersion: user.AuthVersion,
		Status: model.UserSessionStatusActive, RefreshHash: "refresh-hash-" + username, LoginMethod: "password",
		LastActiveAt: now, ExpiresAt: now + 3600,
	}
	require.NoError(t, model.CreateUserSession(session))
	accessToken, _, err := service.IssueAccessToken(service.AuthIdentity{
		UserID: user.Id, SessionID: session.SID, UserAuthVersion: user.AuthVersion, SessionVersion: session.Version,
	})
	require.NoError(t, err)
	return user, session, accessToken
}

func TestStandardHTTPRelayAcceptsSessionButRealtimeDoesNot(t *testing.T) {
	setupRelayRouterTestDB(t)
	_, _, accessToken := createRelaySession(t, "relay-session-user")
	engine := gin.New()
	SetRelayRouter(engine)

	chatRequest := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"missing-channel-model","messages":[]}`))
	chatRequest.Header.Set("Authorization", "Bearer "+accessToken)
	chatRequest.Header.Set("Content-Type", "application/json")
	chatResponse := httptest.NewRecorder()
	engine.ServeHTTP(chatResponse, chatRequest)
	assert.Equal(t, http.StatusServiceUnavailable, chatResponse.Code)
	assert.NotContains(t, chatResponse.Body.String(), "AUTH_")

	forbiddenGroupRequest := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"missing-channel-model","group":"not-a-user-group","messages":[]}`))
	forbiddenGroupRequest.Header.Set("Authorization", "Bearer "+accessToken)
	forbiddenGroupRequest.Header.Set("Content-Type", "application/json")
	forbiddenGroupResponse := httptest.NewRecorder()
	engine.ServeHTTP(forbiddenGroupResponse, forbiddenGroupRequest)
	assert.Equal(t, http.StatusForbidden, forbiddenGroupResponse.Code)

	for _, test := range []struct {
		method string
		path   string
	}{
		{method: http.MethodGet, path: "/v1/files"},
		{method: http.MethodDelete, path: "/v1/models/blocked-model"},
	} {
		t.Run(test.method+" "+test.path, func(t *testing.T) {
			request := httptest.NewRequest(test.method, test.path, nil)
			request.Header.Set("Authorization", "Bearer "+accessToken)
			response := httptest.NewRecorder()
			engine.ServeHTTP(response, request)
			assert.Equal(t, http.StatusUnauthorized, response.Code)
		})
	}

	realtimeRequest := httptest.NewRequest(http.MethodGet, "/v1/realtime?model=missing-channel-model", nil)
	realtimeRequest.Header.Set("Authorization", "Bearer "+accessToken)
	realtimeResponse := httptest.NewRecorder()
	engine.ServeHTTP(realtimeResponse, realtimeRequest)
	assert.Equal(t, http.StatusUnauthorized, realtimeResponse.Code)
}

func TestSessionGeminiRelayUsesStandardRelayContext(t *testing.T) {
	setupRelayRouterTestDB(t)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1beta/models/gemini-test:generateContent", r.URL.Path)
		assert.Equal(t, "upstream-key", r.Header.Get("x-goog-api-key"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}`))
	}))
	defer upstream.Close()

	user, _, accessToken := createRelaySession(t, "gemini-session-user")
	setting, err := common.Marshal(dto.UserSetting{AcceptUnsetRatioModel: true})
	require.NoError(t, err)
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", user.Id).Updates(map[string]any{
		"setting": string(setting),
		"quota":   10_000_000,
	}).Error)
	baseURL := upstream.URL
	channel := &model.Channel{
		Type:    constant.ChannelTypeGemini,
		Key:     "upstream-key",
		Status:  common.ChannelStatusEnabled,
		Name:    "gemini-session-test-channel",
		BaseURL: &baseURL,
		Models:  "gemini-test",
		Group:   "default",
		AutoBan: common.GetPointer(0),
	}
	require.NoError(t, model.DB.Create(channel).Error)
	require.NoError(t, model.DB.Create(&model.Ability{
		Group: "default", Model: "gemini-test", ChannelId: channel.Id, Enabled: true,
	}).Error)

	engine := gin.New()
	SetRelayRouter(engine)
	request := httptest.NewRequest(http.MethodPost, "/v1beta/models/gemini-test:generateContent", strings.NewReader(`{"contents":[{"parts":[{"text":"hello"}]}]}`))
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, request)

	require.Equal(t, http.StatusOK, response.Code)
	assert.Contains(t, response.Body.String(), `"candidates"`)
	var consumeLog model.Log
	require.NoError(t, model.DB.Where("user_id = ? AND type = ?", user.Id, model.LogTypeConsume).Order("id DESC").First(&consumeLog).Error)
	assert.Equal(t, "playground-default", consumeLog.TokenName)
}

func TestLegacyPlaygroundEndpointIsDisabled(t *testing.T) {
	setupRelayRouterTestDB(t)
	_, _, accessToken := createRelaySession(t, "legacy-playground-user")
	engine := gin.New()
	SetRelayRouter(engine)

	request := httptest.NewRequest(http.MethodPost, "/pg/chat/completions", strings.NewReader(`{"model":"gpt-test","messages":[]}`))
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, request)

	require.Equal(t, http.StatusGone, response.Code)
	assert.Contains(t, response.Body.String(), "playground_endpoint_disabled")
}

func TestSessionChatUsesStandardRelayResponse(t *testing.T) {
	setupRelayRouterTestDB(t)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1/chat/completions", r.URL.Path)
		assert.Equal(t, "Bearer upstream-key", r.Header.Get("Authorization"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"chatcmpl-test","object":"chat.completion","created":1,"model":"gpt-4o","choices":[{"index":0,"message":{"role":"assistant","content":"ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}`))
	}))
	defer upstream.Close()

	user, _, accessToken := createRelaySession(t, "upstream-session-user")
	setting, err := common.Marshal(dto.UserSetting{AcceptUnsetRatioModel: true})
	require.NoError(t, err)
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", user.Id).Update("setting", string(setting)).Error)
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", user.Id).Update("quota", 10_000_000).Error)
	realToken := &model.Token{
		UserId: user.Id, Key: "real-api-token", Status: common.TokenStatusEnabled,
		ExpiredTime: -1, RemainQuota: 123_456,
	}
	require.NoError(t, model.DB.Create(realToken).Error)
	baseURL := upstream.URL
	channel := &model.Channel{
		Type:    constant.ChannelTypeOpenAI,
		Key:     "upstream-key",
		Status:  common.ChannelStatusEnabled,
		Name:    "session-test-channel",
		BaseURL: &baseURL,
		Models:  "gpt-4o",
		Group:   "default",
		AutoBan: common.GetPointer(0),
	}
	require.NoError(t, model.DB.Create(channel).Error)
	require.NoError(t, model.DB.Create(&model.Ability{
		Group: "default", Model: "gpt-4o", ChannelId: channel.Id, Enabled: true,
	}).Error)

	engine := gin.New()
	SetRelayRouter(engine)
	request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"gpt-4o","messages":[{"role":"user","content":"hello"}]}`))
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, request)

	require.Equal(t, http.StatusOK, response.Code)
	var payload struct {
		Object  string `json:"object"`
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &payload))
	require.Equal(t, "chat.completion", payload.Object)
	require.Len(t, payload.Choices, 1)
	assert.Equal(t, "ok", payload.Choices[0].Message.Content)

	var consumeLog model.Log
	require.NoError(t, model.DB.Where("user_id = ? AND type = ?", user.Id, model.LogTypeConsume).Order("id DESC").First(&consumeLog).Error)
	assert.Equal(t, "playground-default", consumeLog.TokenName)

	token, err := model.GetTokenById(realToken.Id)
	require.NoError(t, err)
	assert.Equal(t, 123_456, token.RemainQuota)
}

func TestSessionRelayRejectsInvalidSessions(t *testing.T) {
	setupRelayRouterTestDB(t)
	engine := gin.New()
	SetRelayRouter(engine)

	tests := []struct {
		name   string
		mutate func(t *testing.T, user *model.User, session *model.UserSession)
	}{
		{
			name: "expired session",
			mutate: func(t *testing.T, _ *model.User, session *model.UserSession) {
				require.NoError(t, model.DB.Model(&model.UserSession{}).Where("sid = ?", session.SID).Update("expires_at", time.Now().Unix()-1).Error)
			},
		},
		{
			name: "revoked session",
			mutate: func(t *testing.T, user *model.User, session *model.UserSession) {
				_, err := model.RevokeUserSession(user.Id, session.SID, "test revoke")
				require.NoError(t, err)
			},
		},
		{
			name: "disabled user",
			mutate: func(t *testing.T, user *model.User, _ *model.UserSession) {
				require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", user.Id).Update("status", common.UserStatusDisabled).Error)
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			user, session, accessToken := createRelaySession(t, "invalid-"+strings.ReplaceAll(test.name, " ", "-"))
			test.mutate(t, user, session)

			request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"gpt-test","messages":[]}`))
			request.Header.Set("Authorization", "Bearer "+accessToken)
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			engine.ServeHTTP(response, request)

			assert.Equal(t, http.StatusUnauthorized, response.Code)
			assert.Contains(t, response.Body.String(), "AUTH_SESSION_REVOKED")
		})
	}
}

func TestSessionRelayRejectsAsyncRoutes(t *testing.T) {
	setupRelayRouterTestDB(t)
	_, _, accessToken := createRelaySession(t, "async-session-user")
	engine := gin.New()
	SetRelayRouter(engine)
	SetVideoRouter(engine)

	tests := []struct {
		method string
		path   string
	}{
		{method: http.MethodPost, path: "/v1/video/generations"},
		{method: http.MethodGet, path: "/v1/video/generations/task-1"},
		{method: http.MethodPost, path: "/v1/videos"},
		{method: http.MethodPost, path: "/suno/fetch"},
	}
	for _, test := range tests {
		t.Run(test.method+" "+test.path, func(t *testing.T) {
			request := httptest.NewRequest(test.method, test.path, nil)
			request.Header.Set("Authorization", "Bearer "+accessToken)
			response := httptest.NewRecorder()
			engine.ServeHTTP(response, request)
			assert.Equal(t, http.StatusUnauthorized, response.Code)
		})
	}
}

func TestListModelsSupportsOpenAIAndGeminiAuthentication(t *testing.T) {
	setupRelayRouterTestDB(t)

	user := model.User{
		Username: "models-user",
		Status:   common.UserStatusEnabled,
		Group:    "default",
		Quota:    100,
	}
	require.NoError(t, model.DB.Create(&user).Error)
	require.NoError(t, model.DB.Create(&model.Token{
		UserId:         user.Id,
		Key:            "modelstestkey",
		Status:         common.TokenStatusEnabled,
		ExpiredTime:    -1,
		UnlimitedQuota: true,
	}).Error)

	engine := gin.New()
	SetRelayRouter(engine)

	tests := []struct {
		name           string
		path           string
		headerName     string
		expectedObject string
		expectedField  string
	}{
		{
			name:           "OpenAI bearer token",
			path:           "/v1/models",
			headerName:     "Authorization",
			expectedObject: "list",
			expectedField:  "data",
		},
		{
			name:          "Gemini API key header",
			path:          "/v1/models",
			headerName:    "x-goog-api-key",
			expectedField: "models",
		},
		{
			name:          "Gemini API key query",
			path:          "/v1/models?key=modelstestkey",
			expectedField: "models",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, test.path, nil)
			if test.headerName != "" {
				value := "modelstestkey"
				if test.headerName == "Authorization" {
					value = "Bearer " + value
				}
				request.Header.Set(test.headerName, value)
			}

			engine.ServeHTTP(recorder, request)

			require.Equal(t, http.StatusOK, recorder.Code)
			var payload map[string]any
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
			assert.Contains(t, payload, test.expectedField)
			assert.NotContains(t, payload, "error")
			if test.expectedObject != "" {
				assert.Equal(t, test.expectedObject, payload["object"])
			}
		})
	}
}

func setupRelayRouterTestDB(t *testing.T) {
	t.Helper()

	require.NoError(t, i18n.Init())
	gin.SetMode(gin.TestMode)
	originalIsMasterNode := common.IsMasterNode
	originalRedisEnabled := common.RedisEnabled
	originalSQLitePath := common.SQLitePath
	originalMainDatabaseType := common.MainDatabaseType()
	originalLogDatabaseType := common.LogDatabaseType()
	originalSQLDSN, hadSQLDSN := os.LookupEnv("SQL_DSN")

	common.IsMasterNode = false
	common.RedisEnabled = false
	common.SQLitePath = fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	require.NoError(t, os.Setenv("SQL_DSN", "local"))
	require.NoError(t, model.InitDB())
	model.LOG_DB = model.DB
	require.NoError(t, model.DB.AutoMigrate(&model.User{}, &model.Token{}, &model.Ability{}, &model.Channel{}, &model.Log{}, &model.UserSubscription{}, &model.UserSession{}))

	t.Cleanup(func() {
		if sqlDB, err := model.DB.DB(); err == nil {
			_ = sqlDB.Close()
		}
		common.IsMasterNode = originalIsMasterNode
		common.RedisEnabled = originalRedisEnabled
		common.SQLitePath = originalSQLitePath
		common.SetDatabaseTypes(originalMainDatabaseType, originalLogDatabaseType)
		if hadSQLDSN {
			require.NoError(t, os.Setenv("SQL_DSN", originalSQLDSN))
		} else {
			require.NoError(t, os.Unsetenv("SQL_DSN"))
		}
	})
}
