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
    // Multi-shell support should still be there for path config
    expect(text).toContain('zsh)');
    expect(text).toContain('bash)');
    expect(text).toContain('fish)');
    expect(text).toContain('ksh|mksh)');
    expect(text).toContain('nu|nushell)');
  });

  it('generates valid Windows downloader script when User-Agent is PowerShell', async () => {
    const mockContext = {
      request: new Request('http://localhost:4321/install', {
        headers: new Headers({ 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WindowsPowerShell/5.1' })
      }),
    } as any;
    
    const response = await getInstall(mockContext);
    const text = await response.text();
    
    expect(response.status).toBe(200);
    expect(text).toContain('$GithubRepo = "c2-07/zahard"');
    expect(text).toContain('Invoke-WebRequest -Uri $DownloadUrl -OutFile $ZaExePath');
    expect(text).toContain('https://github.com/$GithubRepo/releases/latest/download/$BinaryName');
  });
});
