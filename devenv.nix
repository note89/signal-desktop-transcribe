{
  pkgs,
  lib,
  config,
  ...
}:
{
  packages = [
    pkgs.python3
    pkgs.pkg-config
    pkgs.git-lfs
  ];

  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_22;
    pnpm.enable = true;
    pnpm.package = pkgs.pnpm;
  };

  scripts.app-generate.exec = "pnpm install && pnpm run generate";
  scripts.app-start.exec = "pnpm start";

  enterShell = ''
    # Nix sets SOURCE_DATE_EPOCH=1980 for reproducibility, but Signal derives
    # its build-expiry timestamp from it — builds would be born expired.
    unset SOURCE_DATE_EPOCH
    echo "Signal Desktop devenv — node $(node --version), pnpm $(pnpm --version)"
  '';
}
