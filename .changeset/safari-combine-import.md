---
'@movar/extension': patch
---

Import Combine in the Safari host app's `HostState`, so both app targets archive again.

`ObservableObject` and `@Published` are Combine's types. Some SDKs re-export them transitively through SwiftUI; the iOS/macOS 26 SDK does not, so `HostStateModel` failed to compile the moment a real Xcode saw it — `type 'HostStateModel' does not conform to protocol 'ObservableObject'`, plus `init(wrappedValue:) is not available due to missing import of defining module 'Combine'`. Both schemes failed to archive.

A local `swiftc -typecheck` against the Command Line Tools SDK does not reproduce it, which is why this shipped: the native shell landed having been typechecked but never built, and the gap was known and recorded at the time. The import carries a comment saying exactly that, so nobody on a machine where it looks redundant tidies it back out.

Only `HostState.swift` declares the conformance. `@ObservedObject` in `AboutView` and `MovarRootView` is SwiftUI's own property wrapper and needs nothing.
