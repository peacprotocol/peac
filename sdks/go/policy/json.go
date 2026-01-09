package policy

import (
	"encoding/json"
)

// UnmarshalJSON implements json.Unmarshaler for Purposes.
// Accepts either a single purpose string or an array of purpose strings.
func (p *Purposes) UnmarshalJSON(data []byte) error {
	// Try to unmarshal as array first
	var arr []ControlPurpose
	if err := json.Unmarshal(data, &arr); err == nil {
		*p = arr
		return nil
	}

	// Try as single string
	var single ControlPurpose
	if err := json.Unmarshal(data, &single); err != nil {
		return err
	}
	*p = []ControlPurpose{single}
	return nil
}

// MarshalJSON implements json.Marshaler for Purposes.
func (p Purposes) MarshalJSON() ([]byte, error) {
	if len(p) == 1 {
		return json.Marshal(p[0])
	}
	return json.Marshal([]ControlPurpose(p))
}

// UnmarshalJSON implements json.Unmarshaler for LicensingModes.
// Accepts either a single mode string or an array of mode strings.
func (m *LicensingModes) UnmarshalJSON(data []byte) error {
	// Try to unmarshal as array first
	var arr []ControlLicensingMode
	if err := json.Unmarshal(data, &arr); err == nil {
		*m = arr
		return nil
	}

	// Try as single string
	var single ControlLicensingMode
	if err := json.Unmarshal(data, &single); err != nil {
		return err
	}
	*m = []ControlLicensingMode{single}
	return nil
}

// MarshalJSON implements json.Marshaler for LicensingModes.
func (m LicensingModes) MarshalJSON() ([]byte, error) {
	if len(m) == 1 {
		return json.Marshal(m[0])
	}
	return json.Marshal([]ControlLicensingMode(m))
}
