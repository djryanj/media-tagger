import fs from 'fs';
import { test, expect } from '@playwright/test';


test.describe('Tag chips and download UI', () => {
    test('shows confirmed tag chips after upload with blank pipe expansion', async ({ page }) => {
      await page.goto('/');
      const submitButton = page.getByRole('button', {
        name: 'Tag all files',
      });
      // Upload a file
      await page.setInputFiles('input[type="file"]', 'e2e/fixtures/sample.jpg');
      // Enter tags with blank pipe expansion
      await page.fill('textarea#media-tags', 'large trees|, large |trees');
      // Server-confirmed chips only exist once a file has been processed
      await expect(page.getByLabel('Downloads')).toHaveCount(0);
      // Submit
      await submitButton.click({ force: true });
      // Expand the download row to reveal the tags the server applied
      await page.getByRole('button', { name: /^Toggle details for / }).click();

      const appliedTags = page.locator('.download-item .tag-chips-row');
      await expect(appliedTags.locator('.tag-chip', { hasText: /^large$/ })).toBeVisible();
      await expect(appliedTags.locator('.tag-chip', { hasText: 'large trees' })).toBeVisible();
    });
  test('shows confirmed tag chips after upload with pipe expansion', async ({ page }) => {
    await page.goto('/');
    const submitButton = page.getByRole('button', {
      name: 'Tag all files',
    });
    // Upload a file
    await page.setInputFiles('input[type="file"]', 'e2e/fixtures/sample.jpg');
    // Enter tags with pipe expansion
    await page.fill('textarea#media-tags', 'big|huge trees, small|large pots');
    // Submit
    await submitButton.click({ force: true });
    await page.getByRole('button', { name: /^Toggle details for / }).click();

    const appliedTags = page.locator('.download-item .tag-chips-row');
    await expect(appliedTags.locator('.tag-chip', { hasText: 'big trees' })).toBeVisible();
    await expect(appliedTags.locator('.tag-chip', { hasText: 'huge trees' })).toBeVisible();
    await expect(appliedTags.locator('.tag-chip', { hasText: 'small pots' })).toBeVisible();
    await expect(appliedTags.locator('.tag-chip', { hasText: 'large pots' })).toBeVisible();
  });

  test('handles long filenames in download UI', async ({ page }) => {
    await page.goto('/');
    const submitButton = page.getByRole('button', {
      name: 'Tag all files',
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
    // Wait for the download row, then expand it to reveal the saved filename
    await expect(page.locator('.download-item')).toBeVisible();
    await page.getByRole('button', { name: `Toggle details for ${longName}` }).click();
    // Should ellipsize and have a tooltip
    const nameEl = page.locator('.download-result-name');
    await expect(nameEl).toBeVisible();
    await expect(nameEl).toHaveAttribute('title', new RegExp(longName));
    // Should not overflow container
    const box = await nameEl.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(600); // Should fit in panel
  });
});
