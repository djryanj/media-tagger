import fs from 'fs';
import { test, expect } from '@playwright/test';


test.describe('Tag chips and download UI', () => {
  test('shows confirmed tag chips after upload with pipe expansion', async ({ page }) => {
    await page.goto('/');
    const submitButton = page.getByRole('button', {
      name: 'Tag and download files',
    });
    // Upload a file
    await page.setInputFiles('input[type="file"]', 'e2e/fixtures/sample.jpg');
    // Enter tags with pipe expansion
    await page.fill('textarea#media-tags', 'big|huge trees, small|large pots');
    // Chips should not be visible before upload
    await expect(page.locator('.confirmed-tags-block')).toHaveCount(0);
    // Submit
    await submitButton.click({ force: true });
    // Wait for chips to appear
    await expect(page.locator('.confirmed-tags-block')).toBeVisible();
    await expect(page.locator('.tag-chip', { hasText: 'big trees' })).toBeVisible();
    await expect(page.locator('.tag-chip', { hasText: 'huge trees' })).toBeVisible();
    await expect(page.locator('.tag-chip', { hasText: 'small pots' })).toBeVisible();
    await expect(page.locator('.tag-chip', { hasText: 'large pots' })).toBeVisible();
  });

  test('handles long filenames in download UI', async ({ page }) => {
    await page.goto('/');
    const submitButton = page.getByRole('button', {
      name: 'Tag and download files',
    });
    // Upload a file with a long name
    const longName = 'averyveryveryveryveryveryverylongfilenamefortestingpurposes.jpg';
    // Upload a file with a long name using a real image buffer
    const imageBuffer = fs.readFileSync('e2e/fixtures/sample.jpg');
    await page.setInputFiles('input[type="file"]', {
      name: longName,
      mimeType: 'image/jpeg',
      buffer: imageBuffer,
    });
    await page.fill('textarea#media-tags', 'test');
    await submitButton.click({ force: true });
    // Wait for download result
    await expect(page.locator('.download-result-name')).toBeVisible();
    // Should ellipsize and have a tooltip
    const nameEl = page.locator('.download-result-name');
    await expect(nameEl).toHaveAttribute('title', new RegExp(longName));
    // Should not overflow container
    const box = await nameEl.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(600); // Should fit in panel
  });
});
