/**
 * SMXV Decoder for Browser
 * Decodes SMXV (encrypted FLV) files back to FLV format for playback
 */

class SMXVDecoder {
    constructor(keyLength, encKey, marsKey) {
        this.keyLength = keyLength;
        this.encKey = encKey;
        this.marsKey = marsKey;
        this.marsParams = this._parseMarsKey(marsKey);
    }

    _parseMarsKey(marsKey) {
        const params = {};
        if (!marsKey) return params;

        const ops = marsKey.split("&");
        for (const op of ops) {
            const parts = op.split("=");
            if (parts.length >= 2) {
                const opType = parts[0]; // "1" for tag type, "2" for tag size
                const opCode = parseInt(parts[1]); // 5 for EXCHANGE, 1 for ADD, etc.
                const opValue = parts.length > 2 ? parseInt(parts[2]) : 0;

                if (opType === "1") { // Tag type operation
                    params.typeOp = opCode;
                } else if (opType === "2") { // Tag size operation
                    params.sizeOp = opCode;
                    params.sizeValue = opValue;
                }
            }
        }
        return params;
    }

    /**
     * Decrypt data using AES/CBC/NoPadding
     * Uses CryptoJS library for AES decryption (more reliable than Web Crypto API)
     */
    async decryptAES(encryptedData) {
        if (this.keyLength === 0) {
            return encryptedData instanceof Uint8Array ? encryptedData : new Uint8Array(encryptedData);
        }

        if (!this.encKey || this.encKey.length !== 16) {
            throw new Error(`enc_key must be exactly 16 bytes, got ${this.encKey ? this.encKey.length : 0}`);
        }

        // Check if CryptoJS is available
        if (typeof CryptoJS === 'undefined') {
            throw new Error('CryptoJS library is not loaded. Please include crypto-js library.');
        }

        // Ensure encryptedData is Uint8Array
        const encryptedArray = encryptedData instanceof Uint8Array 
            ? encryptedData 
            : new Uint8Array(encryptedData);

        if (encryptedArray.length < 16) {
            throw new Error(`Encrypted data must be at least 16 bytes (AES block size), got ${encryptedArray.length}`);
        }

        // Pad to multiple of 16 bytes (AES block size)
        let dataToDecrypt = encryptedArray;
        if (dataToDecrypt.length % 16 !== 0) {
            const paddedLength = Math.ceil(dataToDecrypt.length / 16) * 16;
            const padded = new Uint8Array(paddedLength);
            padded.set(dataToDecrypt);
            dataToDecrypt = padded;
        }

        try {
            const ivString = "F2U^s&6%MgteQ##I";
            
            console.log(`AES decrypt using CryptoJS: keyLength=${this.encKey.length}, ivLength=${ivString.length}, dataLength=${dataToDecrypt.length}`);

            // Convert to CryptoJS format
            const key = CryptoJS.enc.Utf8.parse(this.encKey);
            const iv = CryptoJS.enc.Utf8.parse(ivString);
            
            // Convert Uint8Array to CryptoJS WordArray
            // CryptoJS expects data as WordArray, we need to convert bytes
            const words = [];
            for (let i = 0; i < dataToDecrypt.length; i += 4) {
                let word = 0;
                for (let j = 0; j < 4 && (i + j) < dataToDecrypt.length; j++) {
                    word |= (dataToDecrypt[i + j] << (24 - j * 8));
                }
                words.push(word);
            }
            const encrypted = CryptoJS.lib.WordArray.create(words, dataToDecrypt.length);

            // Decrypt using CryptoJS (NoPadding mode)
            const decrypted = CryptoJS.AES.decrypt(
                { ciphertext: encrypted },
                key,
                {
                    iv: iv,
                    mode: CryptoJS.mode.CBC,
                    padding: CryptoJS.pad.NoPadding
                }
            );

            // Convert back to Uint8Array
            const decryptedWords = decrypted.words;
            const decryptedBytes = new Uint8Array(this.keyLength);
            for (let i = 0; i < this.keyLength; i++) {
                const wordIndex = Math.floor(i / 4);
                const byteIndex = i % 4;
                if (wordIndex < decryptedWords.length) {
                    decryptedBytes[i] = (decryptedWords[wordIndex] >>> (24 - byteIndex * 8)) & 0xFF;
                }
            }

            console.log(`AES decryption successful: decrypted ${decryptedBytes.length} bytes`);
            return decryptedBytes;
        } catch (error) {
            console.error('AES decryption error:', error);
            console.error('Error name:', error.name);
            console.error('Error message:', error.message);
            console.error('Key length:', this.keyLength);
            console.error('Key:', this.encKey);
            console.error('Encrypted data length:', encryptedArray.length);
            console.error('Padded data length:', dataToDecrypt.length);
            throw new Error(`AES decryption failed: ${error.message}`);
        }
    }

    /**
     * Reverse marsString operations on FLV tag headers
     */
    reverseMarsOperations(flvData) {
        if (!this.marsParams || Object.keys(this.marsParams).length === 0) {
            return flvData;
        }

        const data = new Uint8Array(flvData);

        // Check FLV header
        if (data.length < 9) {
            throw new Error("FLV file too short, missing header");
        }

        // Check FLV signature
        const flvSignature = String.fromCharCode(...data.slice(0, 3));
        if (flvSignature !== "FLV") {
            console.warn(`Warning: FLV signature not found, got: ${flvSignature}`);
        } else {
            const version = data[3];
            let flags = data[4];
            const hasVideoOriginal = (flags & 0x01) !== 0;
            const hasAudioOriginal = (flags & 0x04) !== 0;

            // Swap header flags if tag types were swapped
            if (this.marsParams.typeOp === 5) {
                let newFlags = flags;
                if (hasVideoOriginal && hasAudioOriginal) {
                    newFlags = (flags & ~0x05) | ((flags & 0x01) << 2) | ((flags & 0x04) >> 2);
                    data[4] = newFlags;
                } else if (hasVideoOriginal) {
                    newFlags = (flags & ~0x01) | 0x04;
                    data[4] = newFlags;
                } else if (hasAudioOriginal) {
                    newFlags = (flags & ~0x04) | 0x01;
                    data[4] = newFlags;
                }
            }
        }

        let pos = 9; // Skip FLV header (9 bytes)
        let tagCount = 0;
        let videoTagCount = 0;
        let audioTagCount = 0;
        let scriptTagCount = 0;
        let lastOriginalDataLength = null;

        while (pos < data.length - 15) {
            // Read previousTagSize (4 bytes)
            if (pos + 4 > data.length) break;

            let prevTagSize = (data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3];

            // Reverse previousTagSize if size operation was applied
            if (this.marsParams.sizeOp === 1) {
                const originalPrevTagSize = prevTagSize - this.marsParams.sizeValue;
                if (originalPrevTagSize >= 11) {
                    prevTagSize = originalPrevTagSize;
                    data[pos] = (prevTagSize >> 24) & 0xFF;
                    data[pos + 1] = (prevTagSize >> 16) & 0xFF;
                    data[pos + 2] = (prevTagSize >> 8) & 0xFF;
                    data[pos + 3] = prevTagSize & 0xFF;
                }
            }

            pos += 4;

            // Read tag header (11 bytes)
            if (pos + 11 > data.length) break;

            let tagType = data[pos];
            const dataLengthBytes = data.slice(pos + 1, pos + 4);
            const modifiedDataLength = (dataLengthBytes[0] << 16) | (dataLengthBytes[1] << 8) | dataLengthBytes[2];

            // Calculate original data_length
            let originalDataLength = modifiedDataLength;
            if (this.marsParams.sizeOp === 1) {
                originalDataLength = modifiedDataLength - this.marsParams.sizeValue;
                if (originalDataLength < 0) originalDataLength = 0;
            }

            // Reverse type operation (EXCHANGE: swap 0x8 and 0x9)
            if (this.marsParams.typeOp === 5) {
                if (tagType === 0x8) {
                    data[pos] = 0x9;
                    tagType = 0x9;
                } else if (tagType === 0x9) {
                    data[pos] = 0x8;
                    tagType = 0x8;
                }
            }

            // Reverse size operation
            if (this.marsParams.sizeOp === 1) {
                data[pos + 1] = (originalDataLength >> 16) & 0xFF;
                data[pos + 2] = (originalDataLength >> 8) & 0xFF;
                data[pos + 3] = originalDataLength & 0xFF;
            }

            // Count tags
            tagCount++;
            if (tagType === 0x9) videoTagCount++;
            else if (tagType === 0x8) audioTagCount++;
            else if (tagType === 0x12) scriptTagCount++;

            lastOriginalDataLength = originalDataLength;

            // Skip to next tag: tag header (11 bytes) + body (original_data_length bytes)
            pos += 11 + originalDataLength;

            if (pos + 4 > data.length) break;
        }

        // Fix the final previousTagSize if exists
        if (lastOriginalDataLength !== null && pos + 4 <= data.length) {
            const finalPrevTagSize = (data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3];
            const expectedFinalPrevTagSize = lastOriginalDataLength + 11;
            if (this.marsParams.sizeOp === 1) {
                if (finalPrevTagSize === expectedFinalPrevTagSize + this.marsParams.sizeValue) {
                    data[pos] = (expectedFinalPrevTagSize >> 24) & 0xFF;
                    data[pos + 1] = (expectedFinalPrevTagSize >> 16) & 0xFF;
                    data[pos + 2] = (expectedFinalPrevTagSize >> 8) & 0xFF;
                    data[pos + 3] = expectedFinalPrevTagSize & 0xFF;
                }
            }
        }

        console.log(`Processed ${tagCount} tags: ${videoTagCount} video, ${audioTagCount} audio, ${scriptTagCount} script`);

        return data.buffer;
    }

    /**
     * Decode SMXV file to FLV
     * @param {ArrayBuffer} smxvData - SMXV file data
     * @returns {Promise<ArrayBuffer>} - Decoded FLV data
     */
    async decode(smxvData) {
        const smxvArray = new Uint8Array(smxvData);

        if (smxvArray.length < this.keyLength) {
            throw new Error(`SMXV file is too small (less than key_length ${this.keyLength})`);
        }

        // Step 1: Decrypt the first key_length bytes
        let flvData;
        if (this.keyLength > 0 && this.encKey) {
            // Read the encrypted part (must be multiple of 16 for AES)
            // Round up to next multiple of 16 (same as Python: (key_length + 15) // 16 * 16)
            const encryptedSize = Math.ceil(this.keyLength / 16) * 16;
            const actualEncryptedSize = Math.min(encryptedSize, smxvArray.length);
            
            console.log(`Decrypting: keyLength=${this.keyLength}, encryptedSize=${encryptedSize}, actualSize=${actualEncryptedSize}`);
            
            const encryptedPart = smxvArray.slice(0, actualEncryptedSize);
            const decryptedPart = await this.decryptAES(encryptedPart);

            // Combine decrypted part (only key_length bytes) with remaining data
            const decryptedArray = new Uint8Array(this.keyLength + smxvArray.length - actualEncryptedSize);
            decryptedArray.set(decryptedPart.slice(0, this.keyLength), 0);
            decryptedArray.set(smxvArray.slice(actualEncryptedSize), this.keyLength);
            flvData = decryptedArray.buffer;
        } else {
            flvData = smxvData;
        }

        // Step 2: Reverse marsString operations
        const decodedFlv = this.reverseMarsOperations(flvData);

        return decodedFlv;
    }
}

