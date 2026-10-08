import { describe, it, expect, vi } from 'vitest';
import { GET as getUnixInstall } from '../src/pages/install';
import { GET as getWindowsInstall } from '../src/pages/install/windows';

describe('Install Scripts', () => {
  const mockContext = {
    request: new Request('http://localhost:4321/install'),
  } as any;

  it('generates valid Unix downloader script', async () => {
    const response = await getUnixInstall(mockContext);
    const text = await response.text();
    
    expect(response.status).toBe(200);
    expect(text).toContain('GITHUB_REPO="c2-07/zahard"');
    expect(text).toContain('https://github.com/$GITHUB_REPO/releases/latest/download');
    // Multi-shell support should still be there for path config
    expect(text).toContain('zsh)');
    expect(text).toContain('bash)');
    expect(text).toContain('fish)');
    expect(text).toContain('ksh|mksh)');
    expect(text).toContain('nu|nushell)');
  });

  it('generates valid Windows downloader script', async () => {
    const response = await getWindowsInstall(mockContext);
    const text = await response.text();
    
    expect(response.status).toBe(200);
    expect(text).toContain('$GithubRepo = "c2-07/zahard"');
    expect(text).toContain('Invoke-WebRequest -Uri $DownloadUrl -OutFile $ZaExePath');
    expect(text).toContain('https://github.com/$GithubRepo/releases/latest/download/$BinaryName');
  });
});
