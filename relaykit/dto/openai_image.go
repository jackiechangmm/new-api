package dto

import (
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"
	"strings"

	kitutil "github.com/QuantumNous/new-api/relaykit/relayconvert/kitutil"
	"github.com/QuantumNous/new-api/relaykit/types"
)

// MaxImageN caps the image generation count. Without this bound a huge or
// wrapped-negative n overflows quota calculation into a negative charge.
const MaxImageN = 128

const APIMartImageModel = "gpt-image-2-official"
const APIMartGrokImagineModel = "grok-imagine-image-2.0"

func IsAPIMartImageModel(model string) bool {
	return model == APIMartImageModel || model == APIMartGrokImagineModel
}

type APIMartImageOptions struct {
	Size         string
	AspectRatio  string
	Resolution   string
	Quality      string
	OutputTokens int
}

var apimartImageTokens = map[string][3][3]int{
	"1:1":  {{196, 1756, 7024}, {397, 3568, 14272}, {659, 5930, 23719}},
	"1:3":  {{56, 535, 2140}, {103, 988, 3952}, {139, 1328, 5311}},
	"3:1":  {{56, 535, 2140}, {103, 988, 3952}, {139, 1328, 5311}},
	"3:2":  {{158, 1372, 5488}, {211, 1838, 7351}, {450, 3926, 15703}},
	"2:3":  {{158, 1372, 5488}, {211, 1838, 7351}, {450, 3926, 15703}},
	"4:3":  {{134, 1204, 4815}, {247, 2223, 8892}, {491, 4413, 17650}},
	"3:4":  {{134, 1204, 4815}, {247, 2223, 8892}, {491, 4413, 17650}},
	"5:4":  {{173, 1510, 6119}, {377, 3303, 13385}, {535, 4690, 19006}},
	"4:5":  {{173, 1510, 6119}, {377, 3303, 13385}, {535, 4690, 19006}},
	"16:9": {{120, 1078, 4312}, {157, 1413, 5650}, {371, 3336, 13342}},
	"9:16": {{120, 1078, 4312}, {157, 1413, 5650}, {371, 3336, 13342}},
	"2:1":  {{132, 1180, 4720}, {180, 1617, 6466}, {300, 2700, 10798}},
	"1:2":  {{132, 1180, 4720}, {180, 1617, 6466}, {300, 2700, 10798}},
	"21:9": {{105, 943, 3682}, {143, 1285, 5016}, {234, 2099, 8196}},
	"9:21": {{105, 943, 3682}, {143, 1285, 5016}, {234, 2099, 8196}},
}

var apimartPixelSizes = map[string][2]string{
	"1024x1024": {"1:1", "1k"}, "2048x2048": {"1:1", "2k"}, "2880x2880": {"1:1", "4k"},
	"1536x1024": {"3:2", "1k"}, "2048x1360": {"3:2", "2k"}, "3520x2336": {"3:2", "4k"},
	"1024x1536": {"2:3", "1k"}, "1360x2048": {"2:3", "2k"}, "2336x3520": {"2:3", "4k"},
	"1024x768": {"4:3", "1k"}, "2048x1536": {"4:3", "2k"}, "3312x2480": {"4:3", "4k"},
	"768x1024": {"3:4", "1k"}, "1536x2048": {"3:4", "2k"}, "2480x3312": {"3:4", "4k"},
	"1280x1024": {"5:4", "1k"}, "2560x2048": {"5:4", "2k"}, "3216x2576": {"5:4", "4k"},
	"1024x1280": {"4:5", "1k"}, "2048x2560": {"4:5", "2k"}, "2576x3216": {"4:5", "4k"},
	"1536x864": {"16:9", "1k"}, "2048x1152": {"16:9", "2k"}, "3840x2160": {"16:9", "4k"},
	"864x1536": {"9:16", "1k"}, "1152x2048": {"9:16", "2k"}, "2160x3840": {"9:16", "4k"},
	"2048x1024": {"2:1", "1k"}, "2688x1344": {"2:1", "2k"}, "3840x1920": {"2:1", "4k"},
	"1024x2048": {"1:2", "1k"}, "1344x2688": {"1:2", "2k"}, "1920x3840": {"1:2", "4k"},
	"1881x836": {"3:1", "1k"}, "1536x512": {"3:1", "1k"}, "3072x1024": {"3:1", "2k"}, "3840x1280": {"3:1", "4k"},
	"887x1774": {"1:3", "1k"}, "512x1536": {"1:3", "1k"}, "1024x3072": {"1:3", "2k"}, "1280x3840": {"1:3", "4k"},
	"2016x864": {"21:9", "1k"}, "2688x1152": {"21:9", "2k"}, "3840x1648": {"21:9", "4k"},
	"864x2016": {"9:21", "1k"}, "1152x2688": {"9:21", "2k"}, "1648x3840": {"9:21", "4k"},
}

func (i ImageRequest) ValidateAPIMartImageRequest() error {
	if !IsAPIMartImageModel(i.Model) {
		return fmt.Errorf("unsupported APIMart image model %q", i.Model)
	}
	if i.Model == APIMartGrokImagineModel {
		return i.validateAPIMartGrokImagineRequest()
	}
	if _, err := i.APIMartImageOptions(); err != nil {
		return err
	}
	if i.Stream != nil && *i.Stream {
		return fmt.Errorf("APIMart does not support image streaming")
	}
	if i.ResponseFormat != "" && i.ResponseFormat != "url" && i.ResponseFormat != "b64_json" {
		return fmt.Errorf("invalid APIMart response_format")
	}
	for _, field := range []struct {
		name   string
		raw    json.RawMessage
		values map[string]bool
	}{
		{"background", i.Background, map[string]bool{"auto": true, "opaque": true, "transparent": true}},
		{"moderation", i.Moderation, map[string]bool{"auto": true, "low": true}},
		{"output_format", i.OutputFormat, map[string]bool{"png": true, "jpeg": true, "webp": true}},
	} {
		if len(field.raw) == 0 {
			continue
		}
		var value string
		if err := kitutil.Unmarshal(field.raw, &value); err != nil || !field.values[value] {
			return fmt.Errorf("invalid APIMart %s", field.name)
		}
	}
	if len(i.OutputCompression) != 0 {
		var compression int
		if err := kitutil.Unmarshal(i.OutputCompression, &compression); err != nil || compression < 0 || compression > 100 {
			return fmt.Errorf("APIMart output_compression must be an integer between 0 and 100")
		}
		var format string
		if err := kitutil.Unmarshal(i.OutputFormat, &format); err != nil || (format != "jpeg" && format != "webp") {
			return fmt.Errorf("APIMart output_compression requires jpeg or webp output_format")
		}
	}
	return nil
}

func (i ImageRequest) validateAPIMartGrokImagineRequest() error {
	prompt := strings.TrimSpace(i.Prompt)
	if prompt == "" || len(prompt) > 8000 {
		return fmt.Errorf("APIMart prompt must be between 1 and 8000 characters")
	}
	if i.Stream != nil && *i.Stream {
		return fmt.Errorf("APIMart does not support image streaming")
	}
	if i.ResponseFormat != "" && i.ResponseFormat != "url" && i.ResponseFormat != "b64_json" {
		return fmt.Errorf("invalid APIMart response_format")
	}
	if i.N != nil && (*i.N < 1 || *i.N > 10) {
		return fmt.Errorf("APIMart n must be an integer between 1 and 10")
	}
	if i.Quality != "" && i.Quality != "low" && i.Quality != "medium" {
		return fmt.Errorf("invalid APIMart quality %q", i.Quality)
	}
	options, err := i.APIMartImageOptions()
	if err != nil {
		return err
	}
	if options.Resolution != "1k" && options.Resolution != "2k" {
		return fmt.Errorf("invalid APIMart resolution %q", options.Resolution)
	}
	return nil
}

func (i ImageRequest) APIMartImageOptions() (APIMartImageOptions, error) {
	if i.Model == APIMartGrokImagineModel {
		aspectRatio := strings.ToLower(strings.TrimSpace(i.Size))
		outputResolution := "1k"
		if parts := strings.Fields(aspectRatio); len(parts) > 0 {
			if len(parts) > 2 || (len(parts) == 2 && parts[1] != "1k" && parts[1] != "2k") {
				return APIMartImageOptions{}, fmt.Errorf("invalid APIMart resolution in size %q", i.Size)
			}
			aspectRatio = parts[0]
			if len(parts) == 2 {
				outputResolution = parts[1]
			}
		}
		if aspectRatio == "" {
			aspectRatio = "auto"
		}
		validRatios := map[string]bool{
			"auto": true, "1:1": true, "3:4": true, "4:3": true, "9:16": true, "16:9": true,
			"2:3": true, "3:2": true, "9:19.5": true, "19.5:9": true, "9:20": true, "20:9": true,
			"1:2": true, "2:1": true,
		}
		if !validRatios[aspectRatio] {
			return APIMartImageOptions{}, fmt.Errorf("invalid APIMart aspect ratio %q", i.Size)
		}
		n := uint(1)
		if i.N != nil {
			n = *i.N
		}
		return APIMartImageOptions{AspectRatio: aspectRatio, Resolution: outputResolution, Quality: strings.ToLower(strings.TrimSpace(i.Quality)), OutputTokens: 1584 * int(n)}, nil
	}

	size := strings.ToLower(strings.TrimSpace(i.Size))
	resolution := "1k"
	if size == "" {
		size = "1:1"
	} else if pixel, ok := apimartPixelSizes[size]; ok {
		size, resolution = pixel[0], pixel[1]
	} else {
		parts := strings.Fields(size)
		if len(parts) > 2 || len(parts) == 0 {
			return APIMartImageOptions{}, fmt.Errorf("invalid APIMart size %q", i.Size)
		}
		size = parts[0]
		if len(parts) == 2 {
			resolution = parts[1]
		}
	}
	if size != "auto" {
		if _, ok := apimartImageTokens[size]; !ok {
			return APIMartImageOptions{}, fmt.Errorf("invalid APIMart size %q", i.Size)
		}
	} else if resolution == "1k" {
		// APIMart 会为 auto 选择最终比例，计费按 1:1 预估。
	}
	resolutionIndex := map[string]int{"1k": 0, "2k": 1, "4k": 2}[resolution]
	if _, ok := map[string]int{"1k": 0, "2k": 1, "4k": 2}[resolution]; !ok {
		return APIMartImageOptions{}, fmt.Errorf("invalid APIMart resolution %q", resolution)
	}
	quality := strings.ToLower(strings.TrimSpace(i.Quality))
	if quality == "" || quality == "auto" {
		quality = "low"
	}
	qualityIndex, ok := map[string]int{"low": 0, "medium": 1, "high": 2}[quality]
	if !ok {
		return APIMartImageOptions{}, fmt.Errorf("invalid APIMart quality %q", i.Quality)
	}
	billingSize := size
	if billingSize == "auto" {
		billingSize = "1:1"
	}
	n := uint(1)
	if i.N != nil {
		n = *i.N
	}
	if n < 1 || n > 4 {
		return APIMartImageOptions{}, fmt.Errorf("APIMart n must be an integer between 1 and 4")
	}
	return APIMartImageOptions{Size: size, Resolution: resolution, Quality: quality, OutputTokens: apimartImageTokens[billingSize][resolutionIndex][qualityIndex] * int(n)}, nil
}

type ImageRequest struct {
	Model             string          `json:"model"`
	Prompt            string          `json:"prompt" binding:"required"`
	N                 *uint           `json:"n,omitempty"`
	Size              string          `json:"size,omitempty"`
	Quality           string          `json:"quality,omitempty"`
	ResponseFormat    string          `json:"response_format,omitempty"`
	Style             json.RawMessage `json:"style,omitempty"`
	User              json.RawMessage `json:"user,omitempty"`
	ExtraFields       json.RawMessage `json:"extra_fields,omitempty"`
	Background        json.RawMessage `json:"background,omitempty"`
	Moderation        json.RawMessage `json:"moderation,omitempty"`
	OutputFormat      json.RawMessage `json:"output_format,omitempty"`
	OutputCompression json.RawMessage `json:"output_compression,omitempty"`
	PartialImages     json.RawMessage `json:"partial_images,omitempty"`
	Stream            *bool           `json:"stream,omitempty"`
	Images            json.RawMessage `json:"images,omitempty"`
	Mask              json.RawMessage `json:"mask,omitempty"`
	InputFidelity     json.RawMessage `json:"input_fidelity,omitempty"`
	Watermark         *bool           `json:"watermark,omitempty"`
	// zhipu 4v
	WatermarkEnabled json.RawMessage `json:"watermark_enabled,omitempty"`
	UserId           json.RawMessage `json:"user_id,omitempty"`
	Image            json.RawMessage `json:"image,omitempty"`
	// 用匿名参数接收额外参数
	Extra map[string]json.RawMessage `json:"-"`
}

func (i *ImageRequest) UnmarshalJSON(data []byte) error {
	// 先解析成 map[string]interface{}
	var rawMap map[string]json.RawMessage
	if err := kitutil.Unmarshal(data, &rawMap); err != nil {
		return err
	}

	// 用 struct tag 获取所有已定义字段名
	knownFields := GetJSONFieldNames(reflect.TypeOf(*i))

	// 再正常解析已定义字段
	type Alias ImageRequest
	var known Alias
	if err := kitutil.Unmarshal(data, &known); err != nil {
		return err
	}
	*i = ImageRequest(known)

	// 提取多余字段
	i.Extra = make(map[string]json.RawMessage)
	for k, v := range rawMap {
		if _, ok := knownFields[k]; !ok {
			i.Extra[k] = v
		}
	}
	return nil
}

// 序列化时需要重新把字段平铺
func (r ImageRequest) MarshalJSON() ([]byte, error) {
	// 将已定义字段转为 map
	type Alias ImageRequest
	alias := Alias(r)
	base, err := kitutil.Marshal(alias)
	if err != nil {
		return nil, err
	}

	var baseMap map[string]json.RawMessage
	if err := kitutil.Unmarshal(base, &baseMap); err != nil {
		return nil, err
	}

	// 不能合并ExtraFields！！！！！！！！
	// 合并 ExtraFields
	//for k, v := range r.Extra {
	//	if _, exists := baseMap[k]; !exists {
	//		baseMap[k] = v
	//	}
	//}

	return kitutil.Marshal(baseMap)
}

func GetJSONFieldNames(t reflect.Type) map[string]struct{} {
	fields := make(map[string]struct{})
	for i := 0; i < t.NumField(); i++ {
		field := t.Field(i)

		// 跳过匿名字段（例如 ExtraFields）
		if field.Anonymous {
			continue
		}

		tag := field.Tag.Get("json")
		if tag == "-" || tag == "" {
			continue
		}

		// 取逗号前字段名（排除 omitempty 等）
		name := tag
		if commaIdx := indexComma(tag); commaIdx != -1 {
			name = tag[:commaIdx]
		}
		fields[name] = struct{}{}
	}
	return fields
}

func indexComma(s string) int {
	for i := 0; i < len(s); i++ {
		if s[i] == ',' {
			return i
		}
	}
	return -1
}

func (i *ImageRequest) GetTokenCountMeta() *types.TokenCountMeta {
	if i.Model == APIMartImageModel {
		if options, err := i.APIMartImageOptions(); err == nil {
			imageN := uint(1)
			if i.N != nil {
				imageN = *i.N
			}
			return &types.TokenCountMeta{
				CombineText:   i.Prompt,
				MaxTokens:     options.OutputTokens,
				BillingRatios: map[string]float64{"n": float64(imageN)},
			}
		}
	}
	var sizeRatio = 1.0
	var qualityRatio = 1.0

	if strings.HasPrefix(i.Model, "dall-e") {
		// Size
		if i.Size == "256x256" {
			sizeRatio = 0.4
		} else if i.Size == "512x512" {
			sizeRatio = 0.45
		} else if i.Size == "1024x1024" {
			sizeRatio = 1
		} else if i.Size == "1024x1792" || i.Size == "1792x1024" {
			sizeRatio = 2
		}

		if i.Model == "dall-e-3" && i.Quality == "hd" {
			qualityRatio = 2.0
			if i.Size == "1024x1792" || i.Size == "1792x1024" {
				qualityRatio = 1.5
			}
		}
	}

	imageN := uint(1)
	if i.N != nil && *i.N > 0 {
		imageN = *i.N
	}

	// Keep n separate from ImagePriceRatio so size/quality and count remain
	// independent billing dimensions. Fixed-price pre-consume stores this on
	// PriceData, and image settlement reuses or replaces the same "n" ratio.
	return &types.TokenCountMeta{
		CombineText:     i.Prompt,
		MaxTokens:       1584,
		ImagePriceRatio: sizeRatio * qualityRatio,
		BillingRatios:   map[string]float64{"n": float64(imageN)},
	}
}

func (i *ImageRequest) IsStream(c *http.Request) bool {
	return i.Stream != nil && *i.Stream
}

func (i *ImageRequest) SetModelName(modelName string) {
	if modelName != "" {
		i.Model = modelName
	}
}

type ImageResponse struct {
	Data     []ImageData     `json:"data"`
	Created  int64           `json:"created"`
	Metadata json.RawMessage `json:"metadata,omitempty"`
}
type ImageData struct {
	Url           string `json:"url"`
	B64Json       string `json:"b64_json"`
	RevisedPrompt string `json:"revised_prompt"`
}
