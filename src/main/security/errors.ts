export class KeyProtectionUnavailableError extends Error {
  constructor() {
    super('OS-backed key protection is unavailable, so no data can be written safely.');
    this.name = 'KeyProtectionUnavailableError';
  }
}

export class KeyIntegrityError extends Error {
  constructor() {
    super('The stored encryption key is malformed or could not be restored.');
    this.name = 'KeyIntegrityError';
  }
}

export class FieldIntegrityError extends Error {
  constructor() {
    super('An encrypted field failed authentication or is malformed.');
    this.name = 'FieldIntegrityError';
  }
}

export class MissingDataKeyError extends Error {
  constructor() {
    super('The vault has stored records but no usable encryption key, so nothing was opened.');
    this.name = 'MissingDataKeyError';
  }
}
