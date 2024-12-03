import Foundation

public class FFT {
    private let n: Int
    private var cosTable: [Float]
    private var sinTable: [Float]

    init(n: Int) {
        self.n = n
        self.cosTable = [Float](repeating: 0.0, count: n / 2)
        self.sinTable = [Float](repeating: 0.0, count: n / 2)

        for i: Int in 0..<n/2 {
            self.cosTable[i] = cos(2.0 * Float.pi * Float(i) / Float(n))
            self.sinTable[i] = sin(2.0 * Float.pi * Float(i) / Float(n))
        }
    }

    func realForward(data: inout [Float]) {
        realForwardRecursive(&data)
    }

    private func realForwardRecursive(_ data: inout[Float]) {
        let n: Int = data.count
        if n <= 1 {
            return
        }

        var even: [Float] = [Float](repeating: 0.0, count: n / 2)
        var odd: [Float] = [Float](repeating: 0.0, count: n / 2)

        for i: Int in 0..<n / 2 {
            even[i] = data[2 * i]
            odd[i] = data[2 * i + 1]
        }

        realForwardRecursive(&even)
        realForwardRecursive(&odd)

        for i: Int in 0..<n / 2 {
            let t: Float = cosTable[i] * odd[i] - sinTable[i] * even[i]
            // let u = sinTable[i] * odd[i] + cosTable[i] * even[i]
            data[i] = even[i] + t
            data[i + n / 2] = even[i] - t
        }
    }
}
