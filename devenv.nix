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
    echo "Signal Desktop devenv — node $(node --version), pnpm $(pnpm --version)"
  '';
}
