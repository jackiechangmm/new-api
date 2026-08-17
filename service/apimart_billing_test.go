package service

import (
	"net/http/httptest"
	"testing"
	"time"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	hosttypes "github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestCalculateTextQuotaSummaryUsesAPIMartImageInputDetails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	usage := &dto.Usage{
		PromptTokens:     1042,
		CompletionTokens: 196,
		TotalTokens:      1238,
		PromptTokensDetails: dto.InputTokenDetails{
			TextTokens:  18,
			ImageTokens: 1024,
		},
		CompletionTokenDetails: dto.OutputTokenDetails{ImageTokens: 196},
	}
	relayInfo := &relaycommon.RelayInfo{
		OriginModelName: "gpt-image-2-official",
		StartTime:       time.Now(),
		PriceData: hosttypes.PriceData{
			ModelRatio:      1,
			ImageRatio:      1.6,
			CompletionRatio: 6,
			GroupRatioInfo:  hosttypes.GroupRatioInfo{GroupRatio: 0.8},
		},
	}

	summary := calculateTextQuotaSummary(ctx, relayInfo, usage)
	require.Equal(t, 1024, summary.ImageTokens)
	// (18 text + 1024 image * 1.6 + 196 output * 6) * group ratio 0.8 = 2265.92，按项目规则四舍五入。
	require.Equal(t, 2266, summary.Quota)
}
