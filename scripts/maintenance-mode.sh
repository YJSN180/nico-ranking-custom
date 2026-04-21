#!/bin/bash
# Maintenance mode management script

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WRANGLER="$SCRIPT_DIR/wrangler-with-token.sh"

# Configuration
MAINTENANCE_FLAGS_BINDING="MAINTENANCE_FLAGS"
PROD_URL="https://nico-rank.com"

# Function to show current status
show_status() {
  echo "=== Current Maintenance Status ==="
  
  local mode=$("$WRANGLER" kv key get --binding=$MAINTENANCE_FLAGS_BINDING "maintenance_mode" --remote --preview false 2>/dev/null || echo "false")
  local allowed_ips=$("$WRANGLER" kv key get --binding=$MAINTENANCE_FLAGS_BINDING "allowed_ips" --remote --preview false 2>/dev/null || echo "none")
  
  if [ "$mode" = "true" ]; then
    echo "Mode: 🔴 ENABLED"
  else
    echo "Mode: 🟢 DISABLED"
  fi
  
  echo "Allowed IPs: $allowed_ips"
  echo ""
}

# Function to enable maintenance mode
enable_maintenance() {
  echo "Enabling maintenance mode..."
  "$WRANGLER" kv key put --binding=$MAINTENANCE_FLAGS_BINDING "maintenance_mode" "true" --remote --preview false
  echo "✅ Maintenance mode ENABLED"
  echo ""
  echo "⚠️  WARNING: Production is now in maintenance mode!"
  echo "Only allowed IPs can access the service."
}

# Function to disable maintenance mode
disable_maintenance() {
  echo "Disabling maintenance mode..."
  "$WRANGLER" kv key put --binding=$MAINTENANCE_FLAGS_BINDING "maintenance_mode" "false" --remote --preview false
  echo "✅ Maintenance mode DISABLED"
  echo ""
  echo "✅ Production is now accessible to all users."
}

ip_is_allowed() {
  local current_ips=$1
  local target_ip=$2
  local current_ip

  IFS=',' read -r -a ips <<< "$current_ips"
  for current_ip in "${ips[@]}"; do
    if [ "$current_ip" = "$target_ip" ]; then
      return 0
    fi
  done

  return 1
}

build_ips_without_target() {
  local current_ips=$1
  local target_ip=$2
  local filtered_ips=""
  local current_ip

  IFS=',' read -r -a ips <<< "$current_ips"
  for current_ip in "${ips[@]}"; do
    if [ -z "$current_ip" ] || [ "$current_ip" = "none" ] || [ "$current_ip" = "$target_ip" ]; then
      continue
    fi

    if [ -z "$filtered_ips" ]; then
      filtered_ips="$current_ip"
    else
      filtered_ips="$filtered_ips,$current_ip"
    fi
  done

  echo "$filtered_ips"
}

# Function to add allowed IP
add_allowed_ip() {
  local ip=$1
  
  # Get current allowed IPs
  local current_ips=$("$WRANGLER" kv key get --binding=$MAINTENANCE_FLAGS_BINDING "allowed_ips" --remote --preview false 2>/dev/null || echo "")
  
  # Add new IP if not already present
  if ip_is_allowed "$current_ips" "$ip"; then
    echo "IP $ip is already in the allowed list"
  else
    if [ -z "$current_ips" ] || [ "$current_ips" = "none" ]; then
      new_ips="$ip"
    else
      new_ips="$current_ips,$ip"
    fi
    
    "$WRANGLER" kv key put --binding=$MAINTENANCE_FLAGS_BINDING "allowed_ips" "$new_ips" --remote --preview false
    echo "✅ Added IP $ip to allowed list"
  fi
}

# Function to remove allowed IP
remove_allowed_ip() {
  local ip=$1
  
  # Get current allowed IPs
  local current_ips=$("$WRANGLER" kv key get --binding=$MAINTENANCE_FLAGS_BINDING "allowed_ips" --remote --preview false 2>/dev/null || echo "")
  
  # Remove IP
  new_ips=$(build_ips_without_target "$current_ips" "$ip")
  
  if [ -z "$new_ips" ]; then
    new_ips="none"
  fi
  
  "$WRANGLER" kv key put --binding=$MAINTENANCE_FLAGS_BINDING "allowed_ips" "$new_ips" --remote --preview false
  echo "✅ Removed IP $ip from allowed list"
}

# Function to test access
test_access() {
  echo "Testing production access..."
  echo ""
  
  echo -n "Public access test: "
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_URL/api/health" || echo "error")
  
  if [ "$STATUS" = "200" ]; then
    echo "✅ Accessible (HTTP 200)"
  elif [ "$STATUS" = "503" ]; then
    echo "🔴 Maintenance mode (HTTP 503)"
  else
    echo "❌ Error (HTTP $STATUS)"
  fi
  
  echo ""
  echo "Your current IP: $(curl -s https://api.ipify.org || echo "unknown")"
}

# Main command handling
case "${1:-status}" in
  "status")
    show_status
    ;;
    
  "enable")
    enable_maintenance
    show_status
    ;;
    
  "disable")
    disable_maintenance
    show_status
    ;;
    
  "allow-ip")
    if [ -z "$2" ]; then
      echo "Error: Please provide an IP address"
      echo "Usage: $0 allow-ip <IP_ADDRESS>"
      exit 1
    fi
    add_allowed_ip "$2"
    show_status
    ;;
    
  "remove-ip")
    if [ -z "$2" ]; then
      echo "Error: Please provide an IP address"
      echo "Usage: $0 remove-ip <IP_ADDRESS>"
      exit 1
    fi
    remove_allowed_ip "$2"
    show_status
    ;;
    
  "allow-me")
    MY_IP=$(curl -s https://api.ipify.org)
    if [ -z "$MY_IP" ]; then
      echo "Error: Could not determine your IP address"
      exit 1
    fi
    echo "Your IP: $MY_IP"
    add_allowed_ip "$MY_IP"
    show_status
    ;;
    
  "test")
    test_access
    ;;
    
  *)
    echo "Maintenance Mode Management"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  status      Show current maintenance status (default)"
    echo "  enable      Enable maintenance mode"
    echo "  disable     Disable maintenance mode"
    echo "  allow-ip    Add an IP to the allowed list"
    echo "  remove-ip   Remove an IP from the allowed list"
    echo "  allow-me    Add your current IP to the allowed list"
    echo "  test        Test production access"
    echo ""
    echo "Examples:"
    echo "  $0 enable"
    echo "  $0 allow-ip 192.168.1.1"
    echo "  $0 allow-me"
    echo "  $0 test"
    exit 1
    ;;
esac
