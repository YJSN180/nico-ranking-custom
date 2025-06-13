# 23 genres × 2 periods × 500 items = theoretical maximum
theoretical_max = 23 * 2 * 500
print(f"Theoretical maximum items: {theoretical_max:,}")

# Actual items fetched
actual_items = 74756
print(f"Actual items fetched: {actual_items:,}")

# Percentage of theoretical max
percentage = (actual_items / theoretical_max) * 100
print(f"Percentage of theoretical max: {percentage:.1f}%")

# Average items per genre/period
avg_per_config = actual_items / 46
print(f"Average items per genre/period: {avg_per_config:.0f}")

# Check if this includes tag rankings
# If we assume each genre has ~10 popular tags and each tag ranking has ~300 items
# That would be additional: 46 configs × 10 tags × 300 items = 138,000 items
# But clearly we're not getting that many, so tag rankings must be partial

# More realistic calculation
# Base rankings: 46 × 500 = 23,000
# Tag rankings (partial due to 404s): ~51,756
base_rankings = 46 * 500
tag_rankings = actual_items - base_rankings
print(f"\nEstimated breakdown:")
print(f"Base rankings: {base_rankings:,}")
print(f"Tag rankings: {tag_rankings:,}")
print(f"Average tag rankings per genre/period: {tag_rankings / 46:.0f}")
