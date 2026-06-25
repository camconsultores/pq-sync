let
    Source = Table.FromRows(
        {
            {1, "2024-01-01", "Product A", 100},
            {2, "2024-01-02", "Product B", 200},
            {3, "2024-01-03", "Product A", 50},
            {4, "2024-01-04", "Product B", 75}
        },
        type table [ID = Int64.Type, Date = text, Product = text, Qty = Int64.Type]
    ),
    #"Filtered Rows" = Table.SelectRows(Source, each ([Product] = "Product A"))
in
    #"Filtered Rows"