let
    Source = Table.FromRows(
        {
            {"Product A", "Category 1"},
            {"Product B", "Category 2"},
            {"Product C", "Category 1"}
        },
        type table [Product = text, Category = text]
    )
in
    Source