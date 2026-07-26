{
  description = "Skein: reproducible web-intelligence development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" "x86_64-darwin" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      formatter = forAllSystems (system: nixpkgs.legacyPackages.${system}.nixfmt-rfc-style);

      devShells = forAllSystems (system:
        let pkgs = nixpkgs.legacyPackages.${system};
        in {
          default = pkgs.mkShell {
            packages = with pkgs; [
              cargo
              cargo-deny
              cargo-nextest
              clippy
              just
              nixfmt-rfc-style
              nodejs_24
              openssl
              pkg-config
              postgresql_17
              python313
              rust-analyzer
              rustc
              rustfmt
              sqlx-cli
              uv
            ];
            env = {
              DATABASE_URL = "postgresql://skein:local-only-skein@127.0.0.1:5432/skein";
              RUST_BACKTRACE = "1";
              UV_PROJECT_ENVIRONMENT = ".venv";
            };
            shellHook = ''
              export PATH="$PWD/node_modules/.bin:$PWD/.venv/bin:$PATH"
              echo "Skein dev shell · Node $(node --version) · Python $(python --version) · Rust $(rustc --version)"
            '';
          };
        });
    };
}
