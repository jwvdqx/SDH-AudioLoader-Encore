import { Dropdown, DropdownOption, Focusable, gamepadDialogClasses, TextField } from "decky-frontend-lib";
import { FocusButton } from "../menu/parts";
import { smallButton } from "./look";
import { useEffect, useMemo, memo } from "react";
import { TiRefreshOutline } from "react-icons/ti";
import { ThemeQueryRequest } from "../apiTypes";
import { genericGET } from "../api";
import { useGlobalState } from "../state";
import { FilterDropdownCustomLabel } from "./FilterDropdownCustomLabel";

export function BrowserSearchFields({
  searchOpts,
  searchOptsVarName,
  prevSearchOptsVarName,
  unformattedFilters,
  unformattedFiltersVarName,
  onReload,
  requiresAuth = false,
  getTargetsPath,
}: {
  searchOpts: ThemeQueryRequest;
  searchOptsVarName: string;
  prevSearchOptsVarName: string;
  unformattedFilters: { filters: string[]; order: string[] };
  unformattedFiltersVarName: string;
  getTargetsPath: string;
  requiresAuth?: boolean;
  onReload: () => void;
}) {
  const { setGlobalState } = useGlobalState();

  async function getThemeTargets() {
    genericGET(`${getTargetsPath}`, requiresAuth).then((data) => {
      if (data?.filters) {
        setGlobalState(unformattedFiltersVarName, {
          filters: data.filters,
          order: data.order,
        });
      }
    });
  }

  const formattedFilters = useMemo<{
    filters: DropdownOption[];
    order: DropdownOption[];
  }>(
    () => ({
      filters: [
        {
          data: "All",
          label: (
            <FilterDropdownCustomLabel
              filterValue="All"
              itemCount={
                Object.values(unformattedFilters.filters).reduce(
                  (prev, cur) => prev + Number(cur),
                  0
                ) || ""
              }
            />
          ),
        },
        ...Object.entries(unformattedFilters.filters)
          .filter(([_, itemCount]) => Number(itemCount) > 0)
          .map(([filterValue, itemCount]) => ({
            data: filterValue,
            label: (
              <FilterDropdownCustomLabel
                filterValue={filterValue}
                itemCount={itemCount}
              />
            ),
          })),
      ],
      order: unformattedFilters.order.map((e) => ({ data: e, label: e })),
    }),
    [unformattedFilters]
  );
  useEffect(() => {
    if (unformattedFilters.filters.length < 2) {
      getThemeTargets();
    }
  }, []);

  const set = (change: Partial<ThemeQueryRequest>) => {
    setGlobalState(prevSearchOptsVarName, searchOpts);
    setGlobalState(searchOptsVarName, { ...searchOpts, ...change });
  };

  // One row, in Encore's style: search, sort, filter and refresh
  return (
    // @ts-ignore
    <Focusable flow-children="row" style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", margin: "10px 0 14px" }}>
      <div style={{ flex: "1 1 220px", minWidth: "200px" }}>
        <TextField value={searchOpts.search} placeholder="Search packs" onChange={(e) => set({ search: e.target.value })} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{ fontSize: "12px", opacity: 0.7 }}>Sort</span>
        <div style={{ minWidth: "190px" }}>
          <Dropdown
            menuLabel="Sort"
            rgOptions={formattedFilters.order}
            strDefaultLabel="Last Updated (Newest)"
            selectedOption={searchOpts.order}
            onChange={(e) => set({ order: e.data })}
          />
        </div>
      </div>
      <div className="CSSLoader_FilterDropDown_Container" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{ fontSize: "12px", opacity: 0.7 }}>Type</span>
        <div style={{ minWidth: "170px" }}>
          <Dropdown
            menuLabel="Type"
            rgOptions={formattedFilters.filters}
            strDefaultLabel="All"
            selectedOption={searchOpts.filters}
            onChange={(e) => set({ filters: e.data })}
          />
        </div>
        <style>
          {`
            .CSSLoader_FilterDropDown_Container > div > button > div > div {
              width: 100%;
              display: flex;
              align-items: start;
            }
            .CSSLoader_FilterDropDown_Container > div > button > div > .${gamepadDialogClasses.Spacer} {
              width: 0;
            }
          `}
        </style>
      </div>
      <FocusButton style={{ ...smallButton(), width: "auto" }} onClick={onReload}>
        <TiRefreshOutline />
        Refresh
      </FocusButton>
    </Focusable>
  );
}

export const MemoizedSearchFields = memo(BrowserSearchFields);
