let
    Source = Table.FromRows(
        {
            {1, "Product A", 100},
            {2, "Product B", 200},
            {3, "Product C", 150}
        },
        type table [ID = Int64.Type, Product = text, Amount = Int64.Type]
    )
in
    Source