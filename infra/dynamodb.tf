# On-demand billing: this table sees low/spiky traffic, so PAY_PER_REQUEST
# avoids provisioning (and paying for) fixed throughput that mostly sits idle.
resource "aws_dynamodb_table" "users_certificate" {
  name         = var.dynamodb_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  # Every issued certificate's record of truth lives only here - protect it
  # from accidental deletes/overwrites with 35 days of point-in-time recovery.
  point_in_time_recovery {
    enabled = true
  }
}
