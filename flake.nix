## WARNING
#
# Nix is not officially supported by Concordium, as such this flake is
# not guaranteed to work or be maintained. Use at your own risk and do not
# create Github issues regarding Nix!
{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    # Provides helpers for Rust toolchains
    rust-overlay.url = "github:oxalica/rust-overlay";
    rust-overlay.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { self, nixpkgs, rust-overlay }:
    let
      rustVersion = "1.85.0";

      # Systems supported
      allSystems = [
        "x86_64-linux" # 64-bit Intel/AMD Linux
        "aarch64-linux" # 64-bit ARM Linux
        "x86_64-darwin" # 64-bit Intel macOS
        "aarch64-darwin" # 64-bit ARM macOS
      ];

      # Helper to provide system-specific attributes
      forAllSystems = f: nixpkgs.lib.genAttrs allSystems (system: f {
        pkgs = import nixpkgs {
          inherit system;
          overlays = [
            # Provides Nixpkgs with a rust-bin attribute for building Rust toolchains
            rust-overlay.overlays.default
            # Uses the rust-bin attribute to select a Rust toolchain
            self.overlays.default
          ];
        };
      });
    in
    {
      overlays.default = final: prev: {
        # The Rust toolchain used for the package build
        rustToolchain = final.rust-bin.stable."${rustVersion}".default.override {
          targets = [ "wasm32-unknown-unknown" "wasm32v1-none" "x86_64-unknown-linux-gnu" ];
          extensions = [ "rust-analyzer" "rust-src" ];
        };
        # Nightly Toolchain instead:
        # rustToolchain = final.rust-bin.selectLatestNightlyWith (toolchain: toolchain.default.override {
        #   targets = [ "wasm32-unknown-unknown" "wasm32v1-none" "x86_64-unknown-linux-gnu" ];
        #   extensions = [ "rust-analyzer" "rust-src" ];
        # });
      };

      devShells = forAllSystems ({ pkgs } : {
        default = pkgs.mkShell {
          # Default to podman for the container runtime
          CARGO_CONCORDIUM_CONTAINER_RUNTIME="podman";
          # Create a cargo-concordium alias that points to the current WIP cargo-concordium
          shellHook = ''export CARGO_CONCORDIUM_MANIFEST_PATH="$(git rev-parse --show-toplevel)/cargo-concordium/Cargo.toml"'';
          buildInputs = with pkgs; [
            rustToolchain
            (writeShellApplication {
              name = "cargo-concordium";
              text = ''
                cargo run --manifest-path "$CARGO_CONCORDIUM_MANIFEST_PATH" -- concordium "$@"
              '';
            })
          ];
        };
      });

      packages = forAllSystems ({ pkgs }: {
        default =
          let
            manifest = (pkgs.lib.importTOML ./cargo-concordium/Cargo.toml).package;
            rustPlatform = pkgs.makeRustPlatform {
              cargo = pkgs.rustToolchain;
              rustc = pkgs.rustToolchain;
            };
          in
          rustPlatform.buildRustPackage {
            name = manifest.name;
            version = manifest.version;
            src = pkgs.lib.cleanSource ./cargo-concordium;
            cargoLock.lockFile = ./cargo-concordium/Cargo.lock;
          };
      });
    };
}
