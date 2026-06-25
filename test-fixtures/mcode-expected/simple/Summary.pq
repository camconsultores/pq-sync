let
    Sales = SalesData,
    Prods = Products,
    Joined = Table.Join(Sales, "Product", Prods, "Product"),
    Grouped = Table.Group(Joined, {"Category"}, {{"Total", each List.Sum([Amount]), Int64.Type}})
in
    Grouped