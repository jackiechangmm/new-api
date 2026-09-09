package controller

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/sync/errgroup"
	_ "golang.org/x/image/webp"
)

type canvasResponseWriter struct {
	gin.ResponseWriter
	body        bytes.Buffer
	header      http.Header
	statusCode  int
	wroteHeader bool
}

func newCanvasResponseWriter(w gin.ResponseWriter) *canvasResponseWriter {
	return &canvasResponseWriter{
		ResponseWriter: w,
		header:         make(http.Header),
	}
}

func (w *canvasResponseWriter) Header() http.Header {
	return w.header
}

func (w *canvasResponseWriter) WriteHeader(code int) {
	if !w.wroteHeader {
		w.statusCode = code
		w.wroteHeader = true
	}
}

func (w *canvasResponseWriter) Write(b []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	return w.body.Write(b)
}

func (w *canvasResponseWriter) WriteString(s string) (int, error) {
	return w.Write([]byte(s))
}

func (w *canvasResponseWriter) Status() int {
	if w.statusCode != 0 {
		return w.statusCode
	}
	return http.StatusOK
}

func (w *canvasResponseWriter) Size() int {
	return w.body.Len()
}

func (w *canvasResponseWriter) Written() bool {
	return w.wroteHeader || w.body.Len() > 0
}

func (w *canvasResponseWriter) WriteHeaderNow() {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
}

func (w *canvasResponseWriter) Flush() {}

func decodeBase64ImageData(raw string) ([]byte, error) {
	if idx := strings.Index(raw, ";base64,"); idx != -1 {
		raw = raw[idx+8:]
	}
	data, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		data, err = base64.RawStdEncoding.DecodeString(raw)
	}
	return data, err
}

func fetchImageBinaryFromURL(ctx context.Context, imageURL string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, imageURL, nil)
	if err != nil {
		return nil, err
	}
	client := service.GetSSRFProtectedHTTPClient()
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("拉取远程图片失败，状态码：%d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxImageBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maxImageBytes {
		return nil, errors.New("生成的图片文件超过 10MB 限制")
	}
	return data, nil
}

func processAndUploadImage(ctx context.Context, driver service.StorageDriver, userId int, item dto.ImageData) (*model.Image, *UploadImageResponse, error) {
	var data []byte
	var err error
	if item.B64Json != "" {
		data, err = decodeBase64ImageData(item.B64Json)
	} else if item.Url != "" {
		data, err = fetchImageBinaryFromURL(ctx, item.Url)
	} else {
		return nil, nil, errors.New("出图响应缺少图片数据")
	}
	if err != nil {
		return nil, nil, err
	}
	if int64(len(data)) > maxImageBytes {
		return nil, nil, errors.New("生成的图片文件超过 10MB 限制")
	}

	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width <= 0 || cfg.Height <= 0 {
		return nil, nil, errors.New("无效或损坏的图片数据")
	}

	var mimeType, ext string
	switch format {
	case "jpeg":
		mimeType = "image/jpeg"
		ext = ".jpg"
	case "png":
		mimeType = "image/png"
		ext = ".png"
	case "webp":
		mimeType = "image/webp"
		ext = ".webp"
	default:
		return nil, nil, fmt.Errorf("不支持的图片格式：%s", format)
	}

	imageId := uuid.NewString()
	relKey := fmt.Sprintf("images/%d/%s%s", userId, imageId, ext)

	finalKey, publicURL, err := driver.Upload(ctx, relKey, data, mimeType)
	if err != nil {
		return nil, nil, fmt.Errorf("上传对象存储失败：%w", err)
	}

	imgRecord := &model.Image{
		Id:       imageId,
		UserId:   userId,
		Key:      finalKey,
		URL:      publicURL,
		Width:    cfg.Width,
		Height:   cfg.Height,
		Bytes:    int64(len(data)),
		MimeType: mimeType,
	}

	if err := model.CreateImage(imgRecord); err != nil {
		_ = driver.Delete(ctx, finalKey)
		return nil, nil, fmt.Errorf("保存图片元数据失败：%w", err)
	}

	return imgRecord, &UploadImageResponse{
		Id:       imgRecord.Id,
		URL:      imgRecord.URL,
		Width:    imgRecord.Width,
		Height:   imgRecord.Height,
		Bytes:    imgRecord.Bytes,
		MimeType: imgRecord.MimeType,
	}, nil
}

func CanvasGenerateImages(c *gin.Context) {
	userId := c.GetInt("id")
	if userId <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "未登录用户不能生成图片"})
		return
	}

	driver := getImageStorageDriver()
	if !driver.IsConfigured() {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "对象存储未配置或不可用"})
		return
	}

	origWriter := c.Writer
	bufWriter := newCanvasResponseWriter(origWriter)
	c.Writer = bufWriter

	// 临时重写为 /v1/images/generations 供内部 Relay 转发
	origURL := *c.Request.URL
	c.Request.URL.Path = "/v1/images/generations"
	defer func() {
		c.Request.URL = &origURL
	}()

	Relay(c, types.RelayFormatOpenAIImage)

	if bufWriter.Status() != http.StatusOK {
		c.Writer = origWriter
		for k, v := range bufWriter.header {
			for _, val := range v {
				origWriter.Header().Add(k, val)
			}
		}
		origWriter.WriteHeader(bufWriter.Status())
		_, _ = origWriter.Write(bufWriter.body.Bytes())
		return
	}

	var imageResp dto.ImageResponse
	if err := common.Unmarshal(bufWriter.body.Bytes(), &imageResp); err != nil || len(imageResp.Data) == 0 {
		c.Writer = origWriter
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "解析出图响应失败"})
		return
	}

	results := make([]UploadImageResponse, len(imageResp.Data))
	uploadedRecords := make([]*model.Image, len(imageResp.Data))
	var mu sync.Mutex

	var g errgroup.Group
	for i, item := range imageResp.Data {
		i, item := i, item
		g.Go(func() error {
			record, res, err := processAndUploadImage(c.Request.Context(), driver, userId, item)
			if err != nil {
				return err
			}
			mu.Lock()
			results[i] = *res
			uploadedRecords[i] = record
			mu.Unlock()
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		common.SysError(fmt.Sprintf("画布生成图片转存失败：%v", err))
		for _, rec := range uploadedRecords {
			if rec != nil {
				_ = driver.Delete(c.Request.Context(), rec.Key)
				_ = model.DeleteImage(rec.Id)
			}
		}
		c.Writer = origWriter
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "转存生成图片到对象存储失败"})
		return
	}

	c.Writer = origWriter
	common.ApiSuccess(c, results)
}
