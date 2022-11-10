import React, { useCallback, useMemo, useState } from "react";
import _ from "underscore";
import { connect } from "react-redux";
import { t } from "ttag";

import Breadcrumbs from "metabase/components/Breadcrumbs";
import Icon, { IconProps } from "metabase/components/Icon";

import { getCrumbs } from "metabase/lib/collections";
import { color } from "metabase/lib/colors";

import Collections from "metabase/entities/collections";
import Search from "metabase/entities/search";

import { entityListLoader } from "metabase/entities/containers/EntityListLoader";
import { entityObjectLoader } from "metabase/entities/containers/EntityObjectLoader";
import { isRootCollection } from "metabase/collections/utils";

import type { Collection } from "metabase-types/api";
import type { State } from "metabase-types/store";

import type { PickerItem, PickerModel, PickerValue } from "./types";

import Item from "./Item";
import {
  ItemPickerRoot,
  ItemPickerHeader,
  ItemPickerList,
  ScrollAwareLoadingAndErrorWrapper,
  SearchInput,
  SearchToggle,
} from "./ItemPicker.styled";

type SearchQuery = {
  q?: string;
  collection?: Collection["id"];
  models?: PickerModel[];
};

interface SearchEntityListLoaderProps {
  list: PickerItem[];
}

type CollectionItem = PickerItem & Collection;

interface OwnProps {
  value?: PickerValue;
  models: PickerModel[];
  entity?: typeof Collections; // collections/snippets entity
  showSearch?: boolean;
  showScroll?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onChange: (value: PickerValue) => void;
}

interface StateProps {
  collectionsById: Record<Collection["id"], Collection>;
  getCollectionIcon: (collection: Collection) => IconProps;
}

type Props = OwnProps & StateProps;

const getDefaultCollectionIconColor = () => color("text-light");

function canWriteToCollectionOrChildren(collection: Collection) {
  return (
    collection.can_write ||
    collection.children?.some(canWriteToCollectionOrChildren)
  );
}

function mapStateToProps(state: State, props: OwnProps) {
  const entity = props.entity || Collections;
  return {
    collectionsById: entity.selectors.getExpandedCollectionsById(state),
    getCollectionIcon: entity.objectSelectors.getIcon,
  };
}

function getEntityLoaderType(state: State, props: OwnProps) {
  return props.entity?.name ?? "collections";
}

function getItemId(item: PickerItem | PickerValue) {
  if (!item) {
    return;
  }
  if (item.model === "collection") {
    return item.id === null ? "root" : item.id;
  }
  return item.id;
}

function ItemPicker({
  value,
  models,
  collectionsById,
  className,
  style,
  showSearch = true,
  showScroll = true,
  onChange,
  getCollectionIcon,
}: Props) {
  const [openCollectionId, setOpenCollectionId] =
    useState<Collection["id"]>("root");
  const [isSearchEnabled, setIsSearchEnabled] = useState(false);
  const [searchString, setSearchString] = useState("");

  const isPickingNotCollection = models.some(model => model !== "collection");

  const openCollection = collectionsById[openCollectionId];

  const collections = useMemo(() => {
    let list = openCollection?.children || [];

    // show root in itself if we can pick it
    if (
      openCollection &&
      isRootCollection(openCollection) &&
      models.includes("collection")
    ) {
      list = [openCollection, ...list];
    }

    const collectionItems = list
      .filter(canWriteToCollectionOrChildren)
      .map(collection => ({
        ...collection,
        model: "collection",
      }));

    return collectionItems as CollectionItem[];
  }, [openCollection, models]);

  const crumbs = useMemo(
    () =>
      getCrumbs(openCollection, collectionsById, id => setOpenCollectionId(id)),
    [openCollection, collectionsById],
  );

  const searchQuery = useMemo(() => {
    const query: SearchQuery = {};

    if (searchString) {
      query.q = searchString;
    } else {
      query.collection = openCollectionId;
    }

    if (models.length === 1) {
      query.models = models;
    }

    return query;
  }, [models, searchString, openCollectionId]);

  const checkIsItemSelected = useCallback(
    (item: PickerItem) => {
      if (!value || !item) {
        return false;
      }
      const isSameModel = item.model === value.model || models.length === 1;
      return isSameModel && getItemId(item) === getItemId(value);
    },
    [value, models],
  );

  const checkCollectionMaybeHasChildren = useCallback(
    (collection: CollectionItem) => {
      if (isPickingNotCollection) {
        // Non-collection models (e.g. questions, dashboards)
        // are loaded on-demand so we don't know ahead of time
        // if they have children, so we have to assume they do
        return true;
      }

      if (isRootCollection(collection)) {
        // Skip root as we don't show root's sub-collections alongside it
        return false;
      }

      return (
        Array.isArray(collection.children) && collection.children.length > 0
      );
    },
    [isPickingNotCollection],
  );

  const checkHasWritePermissionForItem = useCallback(
    (item: PickerItem) => {
      // if user is selecting a collection, they must have a `write` access to it
      if (models.includes("collection") && item.model === "collection") {
        return item.can_write;
      }

      // if user is selecting something else (e.g. dashboard),
      // they must have `write` access to a collection item belongs to
      const collection = item.collection_id
        ? collectionsById[item.collection_id]
        : collectionsById["root"];
      return collection.can_write;
    },
    [models, collectionsById],
  );

  const handleSearchInputKeyPress = useCallback(e => {
    if (e.key === "Enter") {
      setSearchString(e.target.value);
    }
  }, []);

  const handleOpenSearch = useCallback(() => {
    setIsSearchEnabled(true);
  }, []);

  const handleCloseSearch = useCallback(() => {
    setIsSearchEnabled(false);
    setSearchString("");
  }, []);

  const handleCollectionSelected = useCallback(
    (collection: PickerItem) => {
      if (isRootCollection(collection as unknown as Collection)) {
        onChange({ id: null, model: "collection" });
      } else {
        onChange(collection);
      }
    },
    [onChange],
  );

  const handleCollectionOpen = useCallback(collectionId => {
    setOpenCollectionId(collectionId);
  }, []);

  const renderHeader = useCallback(() => {
    if (isSearchEnabled) {
      return (
        <ItemPickerHeader data-testid="item-picker-header">
          <SearchInput
            type="search"
            className="input"
            placeholder={t`Search`}
            autoFocus
            onKeyPress={handleSearchInputKeyPress}
          />
          <SearchToggle onClick={handleCloseSearch}>
            <Icon name="close" />
          </SearchToggle>
        </ItemPickerHeader>
      );
    }

    return (
      <ItemPickerHeader data-testid="item-picker-header">
        <Breadcrumbs crumbs={crumbs} />
        {showSearch && (
          <SearchToggle onClick={handleOpenSearch}>
            <Icon name="search" />
          </SearchToggle>
        )}
      </ItemPickerHeader>
    );
  }, [
    isSearchEnabled,
    crumbs,
    showSearch,
    handleOpenSearch,
    handleCloseSearch,
    handleSearchInputKeyPress,
  ]);

  const renderCollectionListItem = useCallback(
    (collection: CollectionItem) => {
      const hasChildren = checkCollectionMaybeHasChildren(collection);

      // NOTE: this assumes the only reason you'd be selecting a collection is to modify it in some way
      const canSelect = models.includes("collection") && collection.can_write;

      const icon = getCollectionIcon(collection);

      if (canSelect || hasChildren) {
        return (
          <Item
            key={`collection-${collection.id}`}
            item={collection}
            name={collection.name}
            color={
              icon.color ? color(icon.color) : getDefaultCollectionIconColor()
            }
            icon={icon}
            selected={canSelect && checkIsItemSelected(collection)}
            canSelect={canSelect}
            hasChildren={hasChildren}
            onChange={handleCollectionSelected}
            onChangeOpenCollectionId={handleCollectionOpen}
          />
        );
      }

      return null;
    },
    [
      models,
      getCollectionIcon,
      handleCollectionOpen,
      handleCollectionSelected,
      checkIsItemSelected,
      checkCollectionMaybeHasChildren,
    ],
  );

  const renderCollectionContentListItem = useCallback(
    (item: PickerItem) => {
      const hasPermission = checkHasWritePermissionForItem(item);

      if (
        hasPermission &&
        // only include desired models (TODO: ideally the endpoint would handle this)
        models.includes(item.model) &&
        // remove collections unless we're searching
        // (so a user can navigate through collections)
        (item.model !== "collection" || !!searchString)
      ) {
        return (
          <Item
            key={item.id}
            item={item}
            name={item.getName()}
            color={item.getColor()}
            icon={item.getIcon().name}
            selected={checkIsItemSelected(item)}
            canSelect={hasPermission}
            onChange={onChange}
          />
        );
      }

      return null;
    },
    [
      models,
      searchString,
      onChange,
      checkHasWritePermissionForItem,
      checkIsItemSelected,
    ],
  );

  return (
    <ScrollAwareLoadingAndErrorWrapper
      loading={!collectionsById}
      hasScroll={showScroll}
    >
      <ItemPickerRoot className={className} style={style}>
        {renderHeader()}
        <ItemPickerList data-testid="item-picker-list">
          {!searchString && collections.map(renderCollectionListItem)}
          {(isPickingNotCollection || searchString) && (
            <Search.ListLoader query={searchQuery} wrapped>
              {({ list }: SearchEntityListLoaderProps) => (
                <div>{list.map(renderCollectionContentListItem)}</div>
              )}
            </Search.ListLoader>
          )}
        </ItemPickerList>
      </ItemPickerRoot>
    </ScrollAwareLoadingAndErrorWrapper>
  );
}

export default _.compose(
  entityObjectLoader({
    id: "root",
    entityType: getEntityLoaderType,
    loadingAndErrorWrapper: false,
  }),
  entityListLoader({
    entityType: getEntityLoaderType,
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps),
)(ItemPicker);