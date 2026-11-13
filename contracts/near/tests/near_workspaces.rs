//! Real NEAR runtime integration tests using near-workspaces sandbox.
//! These tests require a local sandbox binary/network access behavior supported by
//! near-workspaces. In restricted environments they may fail to start the sandbox;
//! that is reported explicitly rather than treated as mocked verification.

use serde_json::json;

#[tokio::test]
#[ignore = "requires NEAR sandbox/workspaces runtime; run explicitly with --ignored"]
async fn near_workspaces_deploy_smoke() -> Result<(), Box<dyn std::error::Error>> {
    let worker = near_workspaces::sandbox().await?;
    let wasm = std::fs::read("artifacts/agent_leash_near.wasm")?;
    let contract = worker.dev_deploy(&wasm).await?;
    let owner = worker.dev_create_account().await?;
    let outcome = owner
        .call(contract.id(), "new")
        .args_json(json!({
            "supported_tokens":[{"token_contract":"usdc.test.near", "decimals":6}],
            "required_storage_deposit": null
        }))
        .max_gas()
        .transact()
        .await?;
    assert!(outcome.is_success());
    Ok(())
}
