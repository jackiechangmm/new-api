package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type digitalAssetTestResponse[T any] struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Data    T      `json:"data"`
}

type digitalAssetTestPage struct {
	Page     int                   `json:"page"`
	PageSize int                   `json:"page_size"`
	Total    int                   `json:"total"`
	Items    []*model.DigitalAsset `json:"items"`
}

func TestDigitalAssetHTTPContractAndUserIsolation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	originalDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	t.Cleanup(func() { model.DB = originalDB })
	require.NoError(t, db.AutoMigrate(
		&model.User{},
		&model.DigitalAsset{},
		&model.DigitalAssetTag{},
		&model.DigitalAssetTagLink{},
	))
	for id := 1; id <= 2; id++ {
		require.NoError(t, db.Create(&model.User{
			Id:       id,
			Username: fmt.Sprintf("asset-user-%d", id),
			Password: "password123",
			Email:    fmt.Sprintf("asset-user-%d@example.com", id),
			AffCode:  fmt.Sprintf("asset-aff-%d", id),
		}).Error)
	}

	router := gin.New()
	router.Use(func(c *gin.Context) {
		userId := 1
		if c.GetHeader("X-Test-User") == "2" {
			userId = 2
		}
		common.SetContextKey(c, constant.ContextKeyUserId, userId)
		c.Next()
	})
	router.GET("/api/digital-assets/", ListDigitalAssets)
	router.GET("/api/digital-assets/tags", ListDigitalAssetTags)
	router.GET("/api/digital-assets/:id", GetDigitalAsset)
	router.POST("/api/digital-assets/", CreateDigitalAsset)
	router.PUT("/api/digital-assets/:id", UpdateDigitalAsset)
	router.PATCH("/api/digital-assets/:id/favorite", SetDigitalAssetFavorite)
	router.DELETE("/api/digital-assets/:id", DeleteDigitalAsset)

	created := performDigitalAssetRequest[model.DigitalAsset](t, router, http.MethodPost, "/api/digital-assets/", `{
		"asset_type":"text",
		"title":"角色提示词",
		"content":"  Create a detailed character portrait  ",
		"tags":[" 角色 ","角色","Scene","scene"]
	}`, "1")
	require.True(t, created.Success)
	assert.Equal(t, "  Create a detailed character portrait  ", created.Data.Content)
	require.Len(t, created.Data.Tags, 2)
	assert.Equal(t, "Scene", created.Data.Tags[0].Name)
	assert.Equal(t, "角色", created.Data.Tags[1].Name)

	second := performDigitalAssetRequest[model.DigitalAsset](t, router, http.MethodPost, "/api/digital-assets/", `{
		"asset_type":"text",
		"title":"场景提示词",
		"content":"A bright city scene",
		"tags":["Scene","物品"]
	}`, "1")
	require.True(t, second.Success)

	tags := performDigitalAssetRequest[[]model.DigitalAssetTag](t, router, http.MethodGet, "/api/digital-assets/tags", "", "1")
	require.True(t, tags.Success)
	require.Len(t, tags.Data, 3)

	page := performDigitalAssetRequest[digitalAssetTestPage](t, router, http.MethodGet, "/api/digital-assets/?p=1&page_size=1", "", "1")
	require.True(t, page.Success)
	assert.Equal(t, 2, page.Data.Total)
	require.Len(t, page.Data.Items, 1)
	assert.Equal(t, second.Data.Id, page.Data.Items[0].Id)

	oldUpdatedAt := int64(10)
	require.NoError(t, db.Model(&model.DigitalAsset{}).Where("id = ?", created.Data.Id).UpdateColumn("updated_at", oldUpdatedAt).Error)
	favorite := performDigitalAssetRequest[model.DigitalAsset](t, router, http.MethodPatch, fmt.Sprintf("/api/digital-assets/%d/favorite", created.Data.Id), `{"is_favorite":true}`, "1")
	require.True(t, favorite.Success)
	assert.True(t, favorite.Data.IsFavorite)
	assert.Equal(t, oldUpdatedAt, favorite.Data.UpdatedAt)

	favoritePage := performDigitalAssetRequest[digitalAssetTestPage](t, router, http.MethodGet, "/api/digital-assets/?favorite=true&p=1&page_size=6", "", "1")
	require.True(t, favoritePage.Success)
	require.Len(t, favoritePage.Data.Items, 1)
	assert.Equal(t, created.Data.Id, favoritePage.Data.Items[0].Id)

	foreignGet := performDigitalAssetRequest[model.DigitalAsset](t, router, http.MethodGet, fmt.Sprintf("/api/digital-assets/%d", created.Data.Id), "", "2")
	foreignFavorite := performDigitalAssetRequest[model.DigitalAsset](t, router, http.MethodPatch, fmt.Sprintf("/api/digital-assets/%d/favorite", created.Data.Id), `{"is_favorite":false}`, "2")
	assert.False(t, foreignGet.Success)
	assert.False(t, foreignFavorite.Success)
	assert.Equal(t, foreignGet.Message, foreignFavorite.Message)

	updated := performDigitalAssetRequest[model.DigitalAsset](t, router, http.MethodPut, fmt.Sprintf("/api/digital-assets/%d", created.Data.Id), `{
		"asset_type":"text",
		"title":"更新后的提示词",
		"content":"Updated prompt content",
		"tags":["角色"]
	}`, "1")
	require.True(t, updated.Success)
	assert.Equal(t, "更新后的提示词", updated.Data.Title)
	assert.Greater(t, updated.Data.UpdatedAt, oldUpdatedAt)
	require.Len(t, updated.Data.Tags, 1)

	deleted := performDigitalAssetRequest[any](t, router, http.MethodDelete, fmt.Sprintf("/api/digital-assets/%d", created.Data.Id), "", "1")
	require.True(t, deleted.Success)
	missing := performDigitalAssetRequest[model.DigitalAsset](t, router, http.MethodGet, fmt.Sprintf("/api/digital-assets/%d", created.Data.Id), "", "1")
	assert.False(t, missing.Success)
	assert.Equal(t, foreignGet.Message, missing.Message)
}

func TestDigitalAssetHTTPRejectsUnsupportedAndOversizedInput(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		common.SetContextKey(c, constant.ContextKeyUserId, 1)
		c.Next()
	})
	router.POST("/api/digital-assets/", CreateDigitalAsset)

	unsupported := performDigitalAssetRequest[any](t, router, http.MethodPost, "/api/digital-assets/", `{"asset_type":"image","title":"x","content":"x"}`, "1")
	assert.False(t, unsupported.Success)
	assert.Contains(t, unsupported.Message, "仅支持文本")

	oversizedTitle := strings.Repeat("a", 101)
	invalid := performDigitalAssetRequest[any](t, router, http.MethodPost, "/api/digital-assets/", fmt.Sprintf(`{"asset_type":"text","title":"%s","content":"x"}`, oversizedTitle), "1")
	assert.False(t, invalid.Success)
	assert.Contains(t, invalid.Message, "标题长度")
}

func performDigitalAssetRequest[T any](t *testing.T, router http.Handler, method string, path string, body string, user string) digitalAssetTestResponse[T] {
	t.Helper()
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Test-User", user)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	require.Equal(t, http.StatusOK, recorder.Code)
	response := digitalAssetTestResponse[T]{}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	return response
}
