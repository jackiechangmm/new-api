package dto

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestAPIMartImageOptions(t *testing.T) {
	tests := []struct {
		name       string
		size       string
		quality    string
		n          uint
		wantSize   string
		wantRes    string
		wantTokens int
	}{
		{"defaults", "", "", 1, "1:1", "1k", 196},
		{"auto 4k", "auto 4k", "auto", 2, "auto", "4k", 1318},
		{"sampled 1:3 2k low", "1:3 2k", "low", 1, "1:3", "2k", 103},
		{"ratio quality", "16:9 2k", "high", 3, "16:9", "2k", 16950},
		{"pixel reverse lookup", "3840x2160", "medium", 1, "16:9", "4k", 3336},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := ImageRequest{Model: APIMartImageModel, Size: tt.size, Quality: tt.quality, N: &tt.n}
			options, err := req.APIMartImageOptions()
			require.NoError(t, err)
			require.Equal(t, tt.wantSize, options.Size)
			require.Equal(t, tt.wantRes, options.Resolution)
			require.Equal(t, tt.wantTokens, options.OutputTokens)
			require.Equal(t, tt.wantTokens, req.GetTokenCountMeta().MaxTokens)
		})
	}

	for size, tokens := range map[string]int{
		"1:1": 196, "1:3": 56, "3:1": 56, "3:2": 158, "2:3": 158,
		"4:3": 134, "3:4": 134, "5:4": 173, "4:5": 173, "16:9": 120,
		"9:16": 120, "2:1": 132, "1:2": 132, "21:9": 105, "9:21": 105,
	} {
		t.Run("1k low "+size, func(t *testing.T) {
			req := ImageRequest{Model: APIMartImageModel, Size: size, Quality: "low"}
			options, err := req.APIMartImageOptions()
			require.NoError(t, err)
			require.Equal(t, tokens, options.OutputTokens)
		})
	}

	for _, request := range []ImageRequest{
		{Model: APIMartImageModel, Size: "1025x1025"},
		{Model: APIMartImageModel, Size: "1:1 8k"},
		{Model: APIMartImageModel, Quality: "standard"},
	} {
		_, err := request.APIMartImageOptions()
		require.Error(t, err)
	}
}
