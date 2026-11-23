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
  let direct = attr(element, kAXChildrenAttribute) as? [AXUIElement] ?? []
  // Native dialogs may be exposed through AXWindows rather than AXChildren.
  if (attr(element, kAXRoleAttribute) as? String) == (kAXApplicationRole as String) {
    return direct + (attr(element, kAXWindowsAttribute) as? [AXUIElement] ?? [])
  }
  return direct
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
func visibleMenuAncestor(_ element: AXUIElement, _ pid: pid_t) -> AXUIElement? {
  var current = element
  for _ in 0..<8 {
    guard let value = attr(current, kAXParentAttribute), CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
    current = unsafeBitCast(value, to: AXUIElement.self)
    if (attr(current, kAXRoleAttribute) as? String) == (kAXMenuItemRole as String), center(current) != nil {
      var owner: pid_t = 0
      guard AXUIElementGetPid(current, &owner) == .success, owner == pid else { return nil }
      return current
    }
  }
  return nil
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
let selectOnly = CommandLine.arguments.contains("--select-only")
let raw = attr(app, "AXExtrasMenuBar")
let bar: AXUIElement? = raw.flatMap { CFGetTypeID($0) == AXUIElementGetTypeID() ? unsafeBitCast($0, to: AXUIElement.self) : nil }
let items = bar.map(children) ?? []
let statusPoint = items.count == 1 ? center(items[0]) : nil
if !selectOnly {
  guard bar != nil else { print("no_owned_status_bar"); exit(4) }
  guard items.count == 1 else { print("unexpected_status_item_count=\(items.count)"); exit(5) }
  guard statusPoint != nil else { print("status_item_bounds_missing"); exit(6) }
}
let originalPointer = CGEvent(source: nil)?.location
func restorePointer() {
  if let status = statusPoint, let original = originalPointer, let current = CGEvent(source: nil)?.location, abs(current.x - status.x) < 2, abs(current.y - status.y) < 2 {
    CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: original, mouseButton: .left)?.post(tap: .cghidEventTap)
  }
}
if !selectOnly, let point = statusPoint {
  let open = AXUIElementPerformAction(items[0], kAXPressAction as CFString)
  if open != .success && open != .cannotComplete { click(point) }
}
var observed = "not_found"
var openedSubmenus = Set<String>()
for _ in 0..<30 {
  if let item = bar.flatMap({ find($0, CommandLine.arguments[2]) }) ?? find(app, CommandLine.arguments[2]) {
    var owner: pid_t = 0
    let ownerResult = AXUIElementGetPid(item, &owner)
    let enabled = attr(item, kAXEnabledAttribute) as? Bool
    let itemPoint = center(item)
    let ancestor = visibleMenuAncestor(item, pid)
    let parentTitle = ancestor.flatMap { attr($0, kAXTitleAttribute) as? String }
    observed = "owner=\(owner) expected=\(pid) owner_result=\(ownerResult.rawValue) enabled=\(String(describing: enabled)) center=\(String(describing: itemPoint))"
    // Hidden submenu items have no bounds until their owned parent is opened.
    if ownerResult == .success, owner == pid, enabled == true, itemPoint == nil, let parent = ancestor, let title = parentTitle, !openedSubmenus.contains(title) {
      var names: CFArray?
      AXUIElementCopyActionNames(parent, &names)
      let actions = names as? [String] ?? []
      let action = actions.contains(kAXShowMenuAction as String) ? kAXShowMenuAction : kAXPressAction
      let result = AXUIElementPerformAction(parent, action as CFString)
      openedSubmenus.insert(title)
      observed += " submenu_open=\(result.rawValue)"
      usleep(100000)
      continue
    }
    if ownerResult == .success, owner == pid, let point = itemPoint, enabled == true {
      var names: CFArray?
      AXUIElementCopyActionNames(item, &names)
      let result = AXUIElementPerformAction(item, kAXPressAction as CFString)
      usleep(100000)
      restorePointer()
      if let title = parentTitle { print("submenu_parent_title=\(title)") }
      print("native_menu_press=\(result.rawValue) actions=\(names as? [String] ?? []) bounds=\(point)")
      exit(result == .success || result == .cannotComplete ? 0 : 7)
    }
  }
  usleep(50000)
}
print("owned_menu_item_not_actionable status=\(String(describing: statusPoint)) pointer=\(String(describing: CGEvent(source: nil)?.location)) \(observed)")
restorePointer()
exit(8)
