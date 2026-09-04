package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
)

const featuredPromptCacheControl = "public, max-age=2592000, immutable"

var ErrFeaturedPromptStorageUnavailable = errors.New("精选词库对象存储未配置")

type FeaturedPromptObjectStore interface {
	Upload(ctx context.Context, data []byte, contentType string) (key string, publicURL string, err error)
	Delete(ctx context.Context, key string) error
}

type featuredPromptS3Store struct {
	client    *s3.Client
	bucket    string
	publicURL string
	prefix    string
}

type unavailableFeaturedPromptStore struct{}

func (unavailableFeaturedPromptStore) Upload(context.Context, []byte, string) (string, string, error) {
	return "", "", ErrFeaturedPromptStorageUnavailable
}

func (unavailableFeaturedPromptStore) Delete(context.Context, string) error {
	return ErrFeaturedPromptStorageUnavailable
}

func NewFeaturedPromptObjectStoreFromEnv() FeaturedPromptObjectStore {
	endpoint := strings.TrimSpace(os.Getenv("FEATURED_PROMPT_S3_ENDPOINT"))
	publicURL := strings.TrimRight(strings.TrimSpace(os.Getenv("FEATURED_PROMPT_S3_PUBLIC_URL")), "/")
	region := strings.TrimSpace(os.Getenv("FEATURED_PROMPT_S3_REGION"))
	bucket := strings.TrimSpace(os.Getenv("FEATURED_PROMPT_S3_BUCKET"))
	accessKey := strings.TrimSpace(os.Getenv("FEATURED_PROMPT_S3_ACCESS_KEY"))
	secretKey := strings.TrimSpace(os.Getenv("FEATURED_PROMPT_S3_SECRET_KEY"))
	if endpoint == "" || publicURL == "" || region == "" || bucket == "" || accessKey == "" || secretKey == "" {
		return unavailableFeaturedPromptStore{}
	}
	if _, err := url.ParseRequestURI(endpoint); err != nil {
		return unavailableFeaturedPromptStore{}
	}
	if _, err := url.ParseRequestURI(publicURL); err != nil {
		return unavailableFeaturedPromptStore{}
	}

	config := aws.Config{
		Region:      region,
		Credentials: credentials.NewStaticCredentialsProvider(accessKey, secretKey, ""),
	}
	client := s3.NewFromConfig(config, func(options *s3.Options) {
		options.BaseEndpoint = aws.String(endpoint)
		options.UsePathStyle = strings.EqualFold(strings.TrimSpace(os.Getenv("FEATURED_PROMPT_S3_PATH_STYLE")), "true")
	})
	return &featuredPromptS3Store{
		client:    client,
		bucket:    bucket,
		publicURL: publicURL,
		prefix:    strings.Trim(strings.TrimSpace(os.Getenv("FEATURED_PROMPT_S3_PREFIX")), "/"),
	}
}

func (s *featuredPromptS3Store) Upload(ctx context.Context, data []byte, contentType string) (string, string, error) {
	extension := map[string]string{
		"image/jpeg": ".jpg",
		"image/png":  ".png",
		"image/webp": ".webp",
	}[contentType]
	if extension == "" {
		return "", "", fmt.Errorf("不支持的封面图片类型：%s", contentType)
	}
	key := path.Join(s.prefix, "featured-prompts", uuid.NewString()+extension)
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:       aws.String(s.bucket),
		Key:          aws.String(key),
		Body:         bytes.NewReader(data),
		ContentType:  aws.String(contentType),
		CacheControl: aws.String(featuredPromptCacheControl),
	})
	if err != nil {
		return "", "", fmt.Errorf("上传精选词库封面失败：%w", err)
	}
	return key, s.publicURL + "/" + key, nil
}

func (s *featuredPromptS3Store) Delete(ctx context.Context, key string) error {
	if strings.TrimSpace(key) == "" {
		return nil
	}
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("删除精选词库封面失败：%w", err)
	}
	return nil
}
