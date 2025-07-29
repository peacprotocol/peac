// plugins/wordpress/assets/fingerprint.js
// Loads FingerprintJS and logs fingerprint hash
import('https://openfpcdn.io/fingerprintjs/v4').then(FingerprintJS => {
  FingerprintJS.load().then(fp => {
    fp.get().then(result => {
      console.log('PEAC Fingerprint:', result.visitorId);
    });
  });
});
