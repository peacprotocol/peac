<?php
/**
 * Plugin Name: PEAC Protocol (AI Access Control)
 * Description: Enforces PEAC pricing, Ed25519 signatures, and anti-bot controls for AI crawlers.
 * Version: 0.9.1-beta
 * Author: PEAC Protocol OSS Team
 * License: Apache-2.0
 */

if (!defined('ABSPATH')) exit;

register_activation_hook(__FILE__, function() {
    add_option('peac_public_key', '');
    add_option('peac_lite_mode_token', '');
});

add_action('admin_menu', function() {
    add_menu_page('PEAC Protocol', 'PEAC Protocol', 'manage_options', 'peac-protocol', 'peac_admin_page');
});

function peac_admin_page() {
    if (isset($_POST['peac_save'])) {
        update_option('peac_public_key', sanitize_text_field($_POST['peac_public_key']));
        update_option('peac_lite_mode_token', sanitize_text_field($_POST['peac_lite_mode_token']));
        echo "<div class='updated'><p>PEAC settings saved.</p></div>";
    }
    $pubkey = esc_attr(get_option('peac_public_key'));
    $token = esc_attr(get_option('peac_lite_mode_token'));
    ?>
    <div class="wrap">
        <h2>PEAC Protocol Settings</h2>
        <form method="post">
            <label>Ed25519 Public Key:</label><br/>
            <input type="text" name="peac_public_key" value="<?php echo $pubkey; ?>" style="width: 60%"/><br/><br/>
            <label>Lite Mode Token (optional):</label><br/>
            <input type="text" name="peac_lite_mode_token" value="<?php echo $token; ?>" style="width: 40%"/><br/><br/>
            <input type="submit" name="peac_save" value="Save" class="button button-primary"/>
        </form>
    </div>
    <?php
}

// MAIN HOOK: Validate AI crawler on each request
add_action('init', function() {
    if (is_admin()) return;
    // Only block non-human (crawler) traffic for demo—improve with better logic for prod.
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
    if (stripos($ua, 'ai') === false && stripos($ua, 'gptbot') === false) return;

    $nonce = $_SERVER['HTTP_X_PEAC_NONCE'] ?? '';
    $ts = $_SERVER['HTTP_X_PEAC_TIMESTAMP'] ?? '';
    $sig = $_SERVER['HTTP_X_PEAC_SIGNATURE'] ?? '';
    $pubkey_b64 = get_option('peac_public_key', '');
    $token = $_SERVER['HTTP_X_PEAC_TOKEN'] ?? '';

    // Lite mode check (if enabled)
    $lite_mode_token = get_option('peac_lite_mode_token', '');
    if ($lite_mode_token && $token === $lite_mode_token) return;

    // Standard signature check (Ed25519)
    if ($nonce && $ts && $sig && $pubkey_b64) {
        $message = $_SERVER['REQUEST_METHOD'] . $_SERVER['REQUEST_URI'] . $nonce . $ts;
        $pubkey = sodium_base642bin($pubkey_b64, SODIUM_BASE64_VARIANT_ORIGINAL);
        $signature = sodium_base642bin($sig, SODIUM_BASE64_VARIANT_ORIGINAL);

        if (!sodium_crypto_sign_verify_detached($signature, $message, $pubkey)) {
            status_header(403);
            exit('PEAC: Invalid Ed25519 signature');
        }

        // TODO: Add nonce replay cache (transient or persistent for prod)
        // TODO: Timestamp freshness check (deny if stale)
    } else {
        status_header(402);
        exit('PEAC: Payment Required or Invalid Signature');
    }
});
?>
