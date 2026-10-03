// Math functions ported from ZzzMathLib.h
// These are essential for the application's vector/matrix operations

/**
 * Compares two vectors for equality
 * @param {Float32Array} v1 - First vector
 * @param {Float32Array} v2 - Second vector
 * @returns {boolean} - True if vectors are equal
 */
export function VectorCompare(v1, v2) {
    const EPSILON = 0.001;
    return Math.abs(v1[0] - v2[0]) < EPSILON &&
           Math.abs(v1[1] - v2[1]) < EPSILON &&
           Math.abs(v1[2] - v2[2]) < EPSILON;
}

/**
 * Compares two quaternions for equality
 * @param {Float32Array} v1 - First quaternion
 * @param {Float32Array} v2 - Second quaternion
 * @returns {boolean} - True if quaternions are equal
 */
export function QuaternionCompare(v1, v2) {
    const EPSILON = 0.001;
    return Math.abs(v1[0] - v2[0]) < EPSILON &&
           Math.abs(v1[1] - v2[1]) < EPSILON &&
           Math.abs(v1[2] - v2[2]) < EPSILON &&
           Math.abs(v1[3] - v2[3]) < EPSILON;
}

/**
 * Vector subtraction: c = a - b
 * @param {Float32Array} a - First vector
 * @param {Float32Array} b - Second vector
 * @param {Float32Array} c - Output vector
 */
export function VectorSubtract(a, b, c) {
    c[0] = a[0] - b[0];
    c[1] = a[1] - b[1];
    c[2] = a[2] - b[2];
}

/**
 * Vector addition: c = a + b
 * @param {Float32Array} a - First vector
 * @param {Float32Array} b - Second vector
 * @param {Float32Array} c - Output vector
 */
export function VectorAdd(a, b, c) {
    c[0] = a[0] + b[0];
    c[1] = a[1] + b[1];
    c[2] = a[2] + b[2];
}

/**
 * Vector scaling: c = scale * a
 * @param {number} scale - Scaling factor
 * @param {Float32Array} a - Input vector
 * @param {Float32Array} c - Output vector
 */
export function VectorScale(scale, a, c) {
    c[0] = scale * a[0];
    c[1] = scale * a[1];
    c[2] = scale * a[2];
}

/**
 * Dot product of two vectors
 * @param {Float32Array} x - First vector
 * @param {Float32Array} y - Second vector
 * @returns {number} - Dot product
 */
export function DotProduct(x, y) {
    return x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
}

/**
 * Vector fill: a = (b, b, b)
 * @param {Float32Array} a - Output vector
 * @param {number} b - Value to fill with
 */
export function VectorFill(a, b) {
    a[0] = b;
    a[1] = b;
    a[2] = b;
}

/**
 * Vector length
 * @param {Float32Array} v - Vector
 * @returns {number} - Length
 */
export function VectorLength(v) {
    return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

/**
 * Vector normalization
 * @param {Float32Array} v - Vector to normalize
 * @returns {number} - Original length
 */
export function VectorNormalize(v) {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if (len > 0) {
        v[0] /= len;
        v[1] /= len;
        v[2] /= len;
    }
    return len;
}

/**
 * Cross product: c = a × b
 * @param {Float32Array} a - First vector
 * @param {Float32Array} b - Second vector
 * @param {Float32Array} c - Output vector
 */
export function CrossProduct(a, b, c) {
    c[0] = a[1] * b[2] - a[2] * b[1];
    c[1] = a[2] * b[0] - a[0] * b[2];
    c[2] = a[0] * b[1] - a[1] * b[0];
}

/**
 * Linear interpolation
 * @param {number} f01 - Start value
 * @param {number} f02 - End value
 * @param {number} fWeight - Interpolation weight (0 to 1)
 * @returns {number} - Interpolated value
 */
export function LInterpolationF(f01, f02, fWeight) {
    return f01 + ((f02 - f01) * fWeight);
}

/**
 * Angle conversion: radians to degrees
 * @param {number} angleRad - Angle in radians
 * @returns {number} - Angle in degrees
 */
export function RAD_TO_ANGLE(angleRad) {
    return angleRad * 57.29577951308232;
}

/**
 * Angle conversion: degrees to radians
 * @param {number} angleDeg - Angle in degrees
 * @returns {number} - Angle in radians
 */
export function ANGLE_TO_RAD(angleDeg) {
    return angleDeg * 0.017453292519943294;
}

/**
 * Clamp a value between min and max
 * @param {number} value - Value to clamp
 * @param {number} max - Maximum value
 * @param {number} min - Minimum value
 */
export function SETLIMITS(value, max, min) {
    if (value > max) value = max;
    else if (value < min) value = min;
}

/**
 * Quaternion copy: b = a
 * @param {Float32Array} a - Source quaternion
 * @param {Float32Array} b - Destination quaternion
 */
export function QuaternionCopy(a, b) {
    b[0] = a[0];
    b[1] = a[1];
    b[2] = a[2];
    b[3] = a[3];
}

/**
 * Vector copy: b = a
 * @param {Float32Array} a - Source vector
 * @param {Float32Array} b - Destination vector
 */
export function VectorCopy(a, b) {
    b[0] = a[0];
    b[1] = a[1];
    b[2] = a[2];
}

/**
 * Vector MA: c = a + scale * b
 * @param {Float32Array} a - Base vector
 * @param {number} scale - Scale factor
 * @param {Float32Array} b - Direction vector
 * @param {Float32Array} c - Output vector
 */
export function VectorMA(a, scale, b, c) {
    c[0] = a[0] + scale * b[0];
    c[1] = a[1] + scale * b[1];
    c[2] = a[2] + scale * b[2];
}