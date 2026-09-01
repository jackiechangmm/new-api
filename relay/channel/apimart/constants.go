package apimart

import "github.com/QuantumNous/new-api/relaykit/dto"

const (
	ChannelName         = "APIMart"
	ModelName           = "gpt-image-2-official"
	MidjourneyModelName = "mj_imagine"
)

var ModelList = []string{ModelName, dto.APIMartGrokImagineModel, MidjourneyModelName}
