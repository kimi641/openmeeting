import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

// 测试运行前注入：临时数据目录 + 初始管理员
const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meeting-api-test-'))

export default defineConfig({
  test: {
    env: {
      DATA_DIR: tmpDataDir,
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'test-password-123',
    },
  },
})
