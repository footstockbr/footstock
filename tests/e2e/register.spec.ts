import { test, expect } from '@playwright/test'

const STEP1_DATA = {
  name: 'Teste Usuario',
  phone: '(11) 99999-9999',
  birthDate: '2000-01-15',
  cpf: '123.456.789-09',
}

const STEP2_DATA = {
  email: 'teste@footstock.com',
  password: 'Test@1234',
  confirmPassword: 'Test@1234',
}

async function fillStep1(page: import('@playwright/test').Page) {
  await page.getByTestId('input-name').fill(STEP1_DATA.name)
  await page.getByTestId('input-phone').fill(STEP1_DATA.phone)
  await page.getByTestId('input-birthDate').fill(STEP1_DATA.birthDate)
  await page.getByTestId('input-cpf').fill(STEP1_DATA.cpf)
}

async function advanceStep1(page: import('@playwright/test').Page) {
  await fillStep1(page)
  await page.getByTestId('btn-next').click()
}

async function fillStep2(page: import('@playwright/test').Page) {
  await page.getByTestId('input-email').fill(STEP2_DATA.email)
  await page.getByTestId('input-password').fill(STEP2_DATA.password)
  await page.getByTestId('input-confirmPassword').fill(STEP2_DATA.confirmPassword)
}

async function advanceStep2(page: import('@playwright/test').Page) {
  await fillStep2(page)
  await page.getByTestId('btn-next').click()
}

test.describe('Register Wizard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/registro')
  })

  test('happy path — complete registration', async ({ page }) => {
    // Step 1: Personal data
    await advanceStep1(page)

    // Step 2: Access
    await advanceStep2(page)

    // Step 3: Club select
    await page.getByTestId('club-FLM3').click()
    await page.getByTestId('btn-next').click()

    // Step 4: Terms
    await page.getByTestId('checkbox-terms').check()
    await page.getByTestId('checkbox-privacy').check()
    await page.getByTestId('btn-submit').click()

    // Should redirect to onboarding
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 10000 })
  })

  test('validation errors on Step 1', async ({ page }) => {
    // Click next without filling anything
    await page.getByTestId('btn-next').click()

    // Expect error messages
    await expect(page.locator('[role="alert"]').first()).toBeVisible()

    // Fill name with too short value
    await page.getByTestId('input-name').fill('AB')
    await page.getByTestId('btn-next').click()

    // Expect error for minimum length
    await expect(
      page.locator('text=Nome deve ter no mínimo 3 caracteres'),
    ).toBeVisible()
  })

  test('password mismatch on Step 2', async ({ page }) => {
    // Complete Step 1
    await advanceStep1(page)

    // Fill Step 2 with mismatched passwords
    await page.getByTestId('input-email').fill('teste@footstock.com')
    await page.getByTestId('input-password').fill('Test@1234')
    await page.getByTestId('input-confirmPassword').fill('Wrong@1234')
    await page.getByTestId('btn-next').click()

    // Expect mismatch error
    await expect(
      page.locator('text=As senhas não conferem'),
    ).toBeVisible()
  })

  test('skip club selection', async ({ page }) => {
    // Complete Steps 1 and 2
    await advanceStep1(page)
    await advanceStep2(page)

    // Skip Step 3
    await page.getByTestId('btn-skip').click()

    // Complete Step 4
    await page.getByTestId('checkbox-terms').check()
    await page.getByTestId('checkbox-privacy').check()
    await page.getByTestId('btn-submit').click()

    // Should redirect to onboarding
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 10000 })
  })
})
