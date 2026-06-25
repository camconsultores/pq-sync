let
    Source = RawData,
    Typed = Table.TransformColumnTypes(Source, {{"Date", type date}}),
    Filtered = Table.SelectRows(Typed, each [Qty] > 0)
in
    Filtered