package controller

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel/apimart"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAPIMartMidjourneyTaskTimeout(t *testing.T) {
	now := time.UnixMilli(2_000_000)
	assert.False(t, isAPIMartMidjourneyTaskTimedOut(&model.Midjourney{SubmitTime: now.Add(-30 * time.Minute).UnixMilli(), Progress: "0%"}, now))
	assert.True(t, isAPIMartMidjourneyTaskTimedOut(&model.Midjourney{SubmitTime: now.Add(-30*time.Minute - time.Millisecond).UnixMilli(), Progress: "0%"}, now))
	assert.False(t, isAPIMartMidjourneyTaskTimedOut(&model.Midjourney{SubmitTime: now.Add(-time.Hour).UnixMilli(), Progress: "100%"}, now))
}

func TestMapAPIMartMidjourneyTaskStatuses(t *testing.T) {
	tests := []struct {
		name           string
		status         string
		progress       string
		gridImageURL   string
		wantStatus     string
		wantProgress   string
		wantImageURL   string
		wantFailReason string
		wantOK         bool
	}{
		{name: "submitted", status: "SUBMITTED", wantStatus: "SUBMITTED", wantProgress: "25%", wantImageURL: "old-grid", wantOK: true},
		{name: "in progress", status: "IN_PROGRESS", progress: "60%", wantStatus: "IN_PROGRESS", wantProgress: "60%", wantImageURL: "old-grid", wantOK: true},
		{name: "success", status: "SUCCESS", progress: "99%", gridImageURL: "new-grid", wantStatus: "SUCCESS", wantProgress: "100%", wantImageURL: "new-grid", wantOK: true},
		{name: "success without grid", status: "SUCCESS", wantStatus: "FAILURE", wantProgress: "100%", wantFailReason: "midjourney_task_failed", wantOK: true},
		{name: "failure", status: "FAILURE", wantStatus: "FAILURE", wantProgress: "100%", wantFailReason: "midjourney_task_failed", wantImageURL: "old-grid", wantOK: true},
		{name: "modal", status: "MODAL", wantStatus: "FAILURE", wantProgress: "100%", wantFailReason: "midjourney_task_failed", wantImageURL: "old-grid", wantOK: true},
		{name: "unknown", status: "QUEUED", wantOK: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			task := &model.Midjourney{MjId: "mj-task", Progress: "25%", ImageUrl: "old-grid", SubmitTime: 10, StartTime: 20}
			result := &apimart.MidjourneyTask{
				Status:       tt.status,
				Progress:     tt.progress,
				PromptEn:     "translated prompt",
				CreatedAt:    100,
				FinishedAt:   200,
				GridImageURL: tt.gridImageURL,
				ImageURLs:    []string{"image-1", "image-2"},
				Buttons:      []dto.ActionButton{{CustomId: "U1", Label: "U1"}},
			}

			item, ok := mapAPIMartMidjourneyTask(task, result)
			assert.Equal(t, tt.wantOK, ok)
			if !tt.wantOK {
				return
			}
			assert.Equal(t, tt.wantStatus, item.Status)
			assert.Equal(t, tt.wantProgress, item.Progress)
			assert.Equal(t, tt.wantImageURL, item.ImageUrl)
			assert.Equal(t, tt.wantFailReason, item.FailReason)
			assert.Equal(t, "translated prompt", item.PromptEn)
			assert.Equal(t, int64(100_000), item.StartTime)
			assert.Equal(t, int64(200_000), item.FinishTime)
			require.Len(t, item.VideoUrls, 2)
			assert.Equal(t, "image-1", item.VideoUrls[0].Url)
			require.Len(t, item.Buttons, 1)
		})
	}
}
