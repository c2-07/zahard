import { describe, it, expect } from 'vitest';
import { GET as getInstall } from '../src/pages/install';

describe('Install Scripts', () => {

  it('generates valid Unix downloader script', async () => {
    const mockContext = {
      request: new Request('http://localhost:4321/install', {
        headers: new Headers({ 'User-Agent': 'curl/7.81.0' })
      }),
    } as any;
    
    const response = await getInstall(mockContext);
    const text = await response.text();
    
    expect(response.status).toBe(200);
    expect(text).toContain('GITHUB_REPO="c2-07/zahard"');
    expect(text).toContain('https://github.com/$GITHUB_REPO/releases/latest/download');
    expect(text).toContain('OS="$(uname -s)"');
    expect(text).toContain('ARCH="$(uname -m)"');
    expect(text).toContain('BINARY_NAME="za-${OS_NAME}-${ARCH_NAME}${EXT}"');
    // Multi-shell support should still be there for path config
    expect(text).toContain('zsh)');
    expect(text).toContain('bash)');
    expect(text).toContain('fish)');
    expect(text).toContain('ksh|mksh)');
    // Verify source reload command, blue ANSI code, and no dot notation
    expect(text).toContain('source ~/.bashrc');
    expect(text).not.toContain('. ~/.${SHELL_NAME}rc');
    expect(text).toContain('za -o file.c');
    expect(text).toContain('rm -f "$HOME/.config/za/user"');

    // Multi-shell coverage
    expect(text).toContain('add_to_posix_file "$HOME/.profile"');
    expect(text).toContain('add_to_posix_file "$HOME/.bashrc"');
    expect(text).toContain('add_to_posix_file "$HOME/.zshrc"');
    expect(text).toContain('add_to_fish_file');
  });

  it('correctly appends PATH to existing config files across all shells (bash, sh, zsh, fish) without duplicates', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const { execSync } = await import('node:child_process');

    const mockContext = {
      request: new Request('http://localhost:4321/install', {
        headers: new Headers({ 'User-Agent': 'curl/7.81.0' })
      }),
    } as any;
    
    const response = await getInstall(mockContext);
    const fullScript = await response.text();

    // Extract the multi-shell PATH setup portion of the script to test execution in an isolated sandbox
    const pathSetupStartIndex = fullScript.indexOf('# --- Multi-Shell PATH Configuration');
    const pathSetupEndIndex = fullScript.indexOf('export PATH="$INSTALL_DIR:$PATH"');
    expect(pathSetupStartIndex).toBeGreaterThan(-1);
    expect(pathSetupEndIndex).toBeGreaterThan(-1);

    const pathScript = fullScript.slice(pathSetupStartIndex, pathSetupEndIndex);

    // Create a temporary sandbox directory as HOME
    const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'za-install-test-'));

    try {
      // 1. Create pre-existing config files with custom content
      const bashrc = path.join(testHome, '.bashrc');
      const zshrc = path.join(testHome, '.zshrc');
      const profile = path.join(testHome, '.profile');
      const fishDir = path.join(testHome, '.config', 'fish');
      fs.mkdirSync(fishDir, { recursive: true });
      const fishConfig = path.join(fishDir, 'config.fish');

      fs.writeFileSync(bashrc, 'alias ll="ls -la"\n', 'utf8');
      fs.writeFileSync(zshrc, '# existing zsh config\nexport FOO="bar"\n', 'utf8');
      fs.writeFileSync(profile, '# existing profile\n', 'utf8');
      fs.writeFileSync(fishConfig, '# existing fish config\n', 'utf8');

      // Execute PATH setup script in a subshell with HOME set to testHome
      const testRunnerScript = `
        HOME="${testHome}"
        INSTALL_DIR="$HOME/.local/bin"
        SHELL_NAME="bash"
        ${pathScript}
      `;

      execSync(testRunnerScript, { shell: '/bin/sh' });

      // Verify each file has the existing content preserved AND PATH appended
      const bashrcContent = fs.readFileSync(bashrc, 'utf8');
      expect(bashrcContent).toContain('alias ll="ls -la"');
      expect(bashrcContent).toContain('export PATH="$HOME/.local/bin:$PATH"');

      const zshrcContent = fs.readFileSync(zshrc, 'utf8');
      expect(zshrcContent).toContain('export FOO="bar"');
      expect(zshrcContent).toContain('export PATH="$HOME/.local/bin:$PATH"');

      const profileContent = fs.readFileSync(profile, 'utf8');
      expect(profileContent).toContain('# existing profile');
      expect(profileContent).toContain('export PATH="$HOME/.local/bin:$PATH"');

      const fishContent = fs.readFileSync(fishConfig, 'utf8');
      expect(fishContent).toContain('# existing fish config');
      expect(fishContent).toContain('$HOME/.local/bin');

      // 2. Test Idempotence: Running again should NOT add duplicate entries
      execSync(testRunnerScript, { shell: '/bin/sh' });

      const bashrcSecond = fs.readFileSync(bashrc, 'utf8');
      const matches = bashrcSecond.match(/export PATH="\$HOME\/\.local\/bin:\$PATH"/g);
      expect(matches?.length).toBe(1);

      const fishSecond = fs.readFileSync(fishConfig, 'utf8');
      const fishMatches = fishSecond.match(/\.local\/bin/g);
      // The single fish line has 2 occurrences: fish_add_path ... || set -gx PATH ...
      expect(fishMatches?.length).toBe(2);

    } finally {
      // Clean up sandbox
      fs.rmSync(testHome, { recursive: true, force: true });
    }
  });

  it('creates shell config files if they do not exist yet', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const { execSync } = await import('node:child_process');

    const mockContext = {
      request: new Request('http://localhost:4321/install', {
        headers: new Headers({ 'User-Agent': 'curl/7.81.0' })
      }),
    } as any;
    
    const response = await getInstall(mockContext);
    const fullScript = await response.text();

    const pathSetupStartIndex = fullScript.indexOf('# --- Multi-Shell PATH Configuration');
    const pathSetupEndIndex = fullScript.indexOf('export PATH="$INSTALL_DIR:$PATH"');
    const pathScript = fullScript.slice(pathSetupStartIndex, pathSetupEndIndex);

    // Fresh empty HOME directory with no shell rc files
    const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'za-install-empty-'));

    try {
      const testRunnerScript = `
        HOME="${testHome}"
        INSTALL_DIR="$HOME/.local/bin"
        SHELL_NAME="zsh"
        ${pathScript}
      `;

      execSync(testRunnerScript, { shell: '/bin/sh' });

      // Should have created .profile and .zshrc
      expect(fs.existsSync(path.join(testHome, '.profile'))).toBe(true);
      expect(fs.readFileSync(path.join(testHome, '.profile'), 'utf8')).toContain('export PATH="$HOME/.local/bin:$PATH"');

      expect(fs.existsSync(path.join(testHome, '.zshrc'))).toBe(true);
      expect(fs.readFileSync(path.join(testHome, '.zshrc'), 'utf8')).toContain('export PATH="$HOME/.local/bin:$PATH"');
    } finally {
      fs.rmSync(testHome, { recursive: true, force: true });
    }
  });

  it('full Unix installer script creates .local/bin/za with executable permissions and configures all shells', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const { execSync } = await import('node:child_process');

    const mockContext = {
      request: new Request('http://localhost:4321/install', {
        headers: new Headers({ 'User-Agent': 'curl/7.81.0' })
      }),
    } as any;
    
    const response = await getInstall(mockContext);
    let fullScript = await response.text();

    const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'za-install-e2e-'));

    try {
      // Create pre-existing shells config files to verify appending behavior
      fs.writeFileSync(path.join(testHome, '.bashrc'), '# bashrc content\n', 'utf8');
      fs.writeFileSync(path.join(testHome, '.zshrc'), '# zshrc content\n', 'utf8');
      fs.writeFileSync(path.join(testHome, '.profile'), '# profile content\n', 'utf8');
      const fishDir = path.join(testHome, '.config', 'fish');
      fs.mkdirSync(fishDir, { recursive: true });
      fs.writeFileSync(path.join(fishDir, 'config.fish'), '# fish content\n', 'utf8');

      // Replace download_file with a mock that writes an executable dummy binary
      const mockDownload = 'download_file() { printf "#!/bin/sh\\necho za v1.0.0\\n" > "$2"; }';
      fullScript = fullScript.replace(/download_file\(\) \{[\s\S]*?\n\}/, mockDownload);

      // Execute full installer script in /bin/sh
      execSync(fullScript, {
        shell: '/bin/sh',
        env: {
          ...process.env,
          HOME: testHome,
          SHELL: '/bin/bash'
        }
      });

      // 1. Verify binary was created at .local/bin/za
      const targetBin = path.join(testHome, '.local', 'bin', 'za');
      expect(fs.existsSync(targetBin)).toBe(true);

      // 2. Verify permissions (executable)
      const stats = fs.statSync(targetBin);
      // In Unix, 0o111 means executable by user, group, or other
      expect((stats.mode & 0o111) !== 0).toBe(true);

      // 3. Verify all shell files had PATH appended and preserved original contents
      expect(fs.readFileSync(path.join(testHome, '.bashrc'), 'utf8')).toContain('export PATH="$HOME/.local/bin:$PATH"');
      expect(fs.readFileSync(path.join(testHome, '.bashrc'), 'utf8')).toContain('# bashrc content');

      expect(fs.readFileSync(path.join(testHome, '.zshrc'), 'utf8')).toContain('export PATH="$HOME/.local/bin:$PATH"');
      expect(fs.readFileSync(path.join(testHome, '.zshrc'), 'utf8')).toContain('# zshrc content');

      expect(fs.readFileSync(path.join(testHome, '.profile'), 'utf8')).toContain('export PATH="$HOME/.local/bin:$PATH"');
      expect(fs.readFileSync(path.join(testHome, '.profile'), 'utf8')).toContain('# profile content');

      expect(fs.readFileSync(path.join(testHome, '.config', 'fish', 'config.fish'), 'utf8')).toContain('$HOME/.local/bin');
      expect(fs.readFileSync(path.join(testHome, '.config', 'fish', 'config.fish'), 'utf8')).toContain('# fish content');

    } finally {
      fs.rmSync(testHome, { recursive: true, force: true });
    }
  });

  it('generates valid Windows downloader script when User-Agent is PowerShell with architecture detection', async () => {
    const mockContext = {
      request: new Request('http://localhost:4321/install', {
        headers: new Headers({ 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WindowsPowerShell/5.1' })
      }),
    } as any;
    
    const response = await getInstall(mockContext);
    const text = await response.text();
    
    expect(response.status).toBe(200);
    expect(text).toContain('$GithubRepo = "c2-07/zahard"');
    expect(text).toContain('$rawArch = $env:PROCESSOR_ARCHITECTURE');
    expect(text).toContain("'ARM64' { $ArchName = 'aarch64' }");
    expect(text).toContain("'AMD64' { $ArchName = 'x86_64' }");
    expect(text).toContain('$BinaryName = "za-windows-$ArchName.exe"');
    expect(text).toContain('Invoke-WebRequest -Uri $DownloadUrl -OutFile $ZaExePath');
    expect(text).toContain('https://github.com/$GithubRepo/releases/latest/download/$BinaryName');
    // Verify PowerShell profile persistence and UTF-8 Out-File encoding
    expect(text).toContain('$PROFILE');
    expect(text).toContain("Out-File:Encoding");
    expect(text).toContain('za -o file.c');
    expect(text).toContain('legacyConfigUser');
  });
});
