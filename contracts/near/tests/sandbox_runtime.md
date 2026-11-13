# Sandbox runtime status

Date: 2026-11-07.

The near-workspaces integration target compiles and links successfully with GNU `bfd`:

```bash
CARGO_TARGET_DIR=target-x86 \
RUSTFLAGS='-C linker=/usr/bin/gcc -C link-arg=-fuse-ld=bfd -C link-arg=-Wl,--no-as-needed -C link-arg=-lpthread' \
cargo test --target x86_64-unknown-linux-gnu --test near_workspaces --no-run
```

The dependency's build-time `install` feature is disabled, so clean compilation does not attempt a download. Running the ignored test fails while the sandbox runner tries to obtain its missing executable: DNS/network resolution is unavailable. No executable named `near-sandbox` or `neard` is installed or cached on the host. Consequently the test remains `#[ignore]`, no lifecycle receipts were produced, and callback gas burn is unverified.
