import { test, expect } from '@playwright/test';
import path from 'path';

// Helper to get a sample file path
function getSampleFile(filename: string) {
  return path.resolve(__dirname, '../e2e/fixtures/', filename);
}

test.describe('Tag chips and download UI', () => {
  test('shows confirmed tag chips after upload with pipe expansion', async ({ page }) => {
    await page.goto('/');
    // Upload a file
    const filePath = getSampleFile('sample.jpg');
    await page.setInputFiles('input[type="file"]', filePath);
    // Enter tags with pipe expansion
    await page.fill('textarea#media-tags', 'big|huge trees, small|large pots');
    // Chips should not be visible before upload
    await expect(page.locator('.confirmed-tags-block')).toHaveCount(0);
    // Submit
    await page.click('button[type="submit"]');
    // Wait for chips to appear
    await expect(page.locator('.confirmed-tags-block')).toBeVisible();
    await expect(page.locator('.tag-chip', { hasText: 'big trees' })).toBeVisible();
    await expect(page.locator('.tag-chip', { hasText: 'huge trees' })).toBeVisible();
    await expect(page.locator('.tag-chip', { hasText: 'small pots' })).toBeVisible();
    await expect(page.locator('.tag-chip', { hasText: 'large pots' })).toBeVisible();
  });

  test('handles long filenames in download UI', async ({ page }) => {
    await page.goto('/');
    // Upload a file with a long name
    const longName = 'averyveryveryveryveryveryverylongfilenamefortestingpurposes.jpg';
    const filePath = getSampleFile('sample.jpg');
    // Rename the file for upload
    const file = new File([await page.evaluate(() => new Blob(["test"]))], longName, { type: 'image/jpeg' });
    await page.setInputFiles('input[type="file"]', file);
    await page.fill('textarea#media-tags', 'test');
    await page.click('button[type="submit"]');
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
