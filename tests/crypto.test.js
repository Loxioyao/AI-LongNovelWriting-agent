import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { encrypt, decrypt } from '../server/crypto.js'

describe('AES-256-GCM 加密/解密', () => {
  test('加密后应返回 iv:tag:ciphertext 格式的字符串', () => {
    const result = encrypt('sk-test-api-key-12345')
    assert.equal(typeof result, 'string')
    const parts = result.split(':')
    assert.equal(parts.length, 3, '应包含 iv:tag:ciphertext 三部分')
  })

  test('解密应返回原始明文', () => {
    const original = 'sk-my-secret-api-key-abc-def-ghi'
    const encrypted = encrypt(original)
    const decrypted = decrypt(encrypted)
    assert.equal(decrypted, original)
  })

  test('相同明文加密两次应产生不同密文', () => {
    const text = 'sk-test-key'
    const enc1 = encrypt(text)
    const enc2 = encrypt(text)
    assert.notEqual(enc1, enc2, '密文应不同（因 IV 随机）')
    assert.equal(decrypt(enc1), text)
    assert.equal(decrypt(enc2), text)
  })

  test('篡改密文后解密应返回 null', () => {
    const encrypted = encrypt('sk-original-key')
    const parts = encrypted.split(':')
    const tampered = parts[0] + ':' + parts[1] + ':' + parts[2].slice(0, -4) + 'XXXX'
    const result = decrypt(tampered)
    assert.equal(result, null, '篡改密文后应返回 null')
  })

  test('格式错误的密文应返回 null', () => {
    assert.equal(decrypt('invalid-data'), null)
    assert.equal(decrypt('only:two-parts'), null)
    assert.equal(decrypt(''), null)
  })

  test('特殊字符的 API Key 也能正常加密解密', () => {
    const specialKey = 'sk-abc123!=@#$%^&*()_+-={}[]|\\:";\'<>?,./'
    const encrypted = encrypt(specialKey)
    const decrypted = decrypt(encrypted)
    assert.equal(decrypted, specialKey)
  })

  test('长 API Key 也能正常加密解密', () => {
    const longKey = 'sk-' + 'a'.repeat(200)
    const encrypted = encrypt(longKey)
    const decrypted = decrypt(encrypted)
    assert.equal(decrypted, longKey)
  })
})
