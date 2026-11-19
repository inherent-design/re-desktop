import Foundation
import ApplicationServices

if CommandLine.arguments.count == 2 && CommandLine.arguments[1] == "--check-accessibility" {
  print(AXIsProcessTrusted() ? "accessibility_available" : "accessibility_unavailable")
  exit(AXIsProcessTrusted() ? 0 : 3)
}

// Only inspect and activate a menu belonging to the explicit test app PID.
func attr(_ element: AXUIElement, _ key: String) -> CFTypeRef? {
  var value: CFTypeRef?
  return AXUIElementCopyAttributeValue(element, key as CFString, &value) == .success ? value : nil
}
func children(_ element: AXUIElement) -> [AXUIElement] {
  return attr(element, kAXChildrenAttribute) as? [AXUIElement] ?? []
}
func find(_ element: AXUIElement, _ title: String, _ depth: Int = 0) -> AXUIElement? {
  if (attr(element, kAXTitleAttribute) as? String) == title { return element }
  if depth > 6 { return nil }
  for child in children(element).prefix(256) {
    if let found = find(child, title, depth + 1) { return found }
  }
  return nil
}
func center(_ element: AXUIElement) -> CGPoint? {
  guard let p = attr(element, kAXPositionAttribute), let s = attr(element, kAXSizeAttribute), CFGetTypeID(p) == AXValueGetTypeID(), CFGetTypeID(s) == AXValueGetTypeID() else { return nil }
  var point = CGPoint.zero
  var size = CGSize.zero
  guard AXValueGetValue(unsafeBitCast(p, to: AXValue.self), .cgPoint, &point), AXValueGetValue(unsafeBitCast(s, to: AXValue.self), .cgSize, &size), size.width > 0, size.height > 0 else { return nil }
  return CGPoint(x: point.x + size.width / 2, y: point.y + size.height / 2)
}
func click(_ point: CGPoint) {
  CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
  usleep(50000)
  for type in [CGEventType.leftMouseDown, CGEventType.leftMouseUp] {
    let event = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: .left)
    event?.setIntegerValueField(.mouseEventClickState, value: 1)
    event?.post(tap: .cghidEventTap)
  }
}
guard (CommandLine.arguments.count == 3 || (CommandLine.arguments.count == 4 && CommandLine.arguments[3] == "--select-only")), let pid = Int32(CommandLine.arguments[1]) else { exit(2) }
guard AXIsProcessTrusted() else { print("accessibility_unavailable"); exit(3) }
let app = AXUIElementCreateApplication(pid)
AXUIElementSetMessagingTimeout(app, 0.5)
guard let raw = attr(app, "AXExtrasMenuBar"), CFGetTypeID(raw) == AXUIElementGetTypeID() else { print("no_owned_status_bar"); exit(4) }
let bar = unsafeBitCast(raw, to: AXUIElement.self)
let items = children(bar)
guard items.count == 1 else { print("unexpected_status_item_count=\(items.count)"); exit(5) }
guard let statusPoint = center(items[0]) else { print("status_item_bounds_missing"); exit(6) }
let originalPointer = CGEvent(source: nil)?.location
func restorePointer() {
  if let original = originalPointer, let current = CGEvent(source: nil)?.location, abs(current.x - statusPoint.x) < 2, abs(current.y - statusPoint.y) < 2 {
    CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: original, mouseButton: .left)?.post(tap: .cghidEventTap)
  }
}
if !CommandLine.arguments.contains("--select-only") { click(statusPoint) }
var observed = "not_found"
for _ in 0..<30 {
  if let item = find(bar, CommandLine.arguments[2]) ?? find(app, CommandLine.arguments[2]) {
    var owner: pid_t = 0
    let ownerResult = AXUIElementGetPid(item, &owner)
    let enabled = attr(item, kAXEnabledAttribute) as? Bool
    let itemPoint = center(item)
    observed = "owner=\(owner) expected=\(pid) owner_result=\(ownerResult.rawValue) enabled=\(String(describing: enabled)) center=\(String(describing: itemPoint))"
    if ownerResult == .success, owner == pid, let point = itemPoint, enabled == true {
      var names: CFArray?
      AXUIElementCopyActionNames(item, &names)
      let result = AXUIElementPerformAction(item, kAXPressAction as CFString)
      usleep(100000)
      restorePointer()
      print("native_menu_press=\(result.rawValue) actions=\(names as? [String] ?? []) bounds=\(point)")
      exit(result == .success || result == .cannotComplete ? 0 : 7)
    }
  }
  usleep(50000)
}
print("owned_menu_item_not_actionable status=\(statusPoint) pointer=\(String(describing: CGEvent(source: nil)?.location)) \(observed)")
restorePointer()
exit(8)
