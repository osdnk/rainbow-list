import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, ViewProps, ViewStyle, TextInput, Platform } from 'react-native';
import {
  CellStorage,
  RecyclerListView,
  RecyclerRow as RawRecyclerRow,
  RecyclerRowWrapper as RawRecyclerRowWrapper,
  UltraFastTextWrapper,
} from './ultimate';
import Animated, {
  runOnJS,
  useSharedValue,
  useDerivedValue,
  useWorkletCallback,
  runOnUI,
} from 'react-native-reanimated';
// import {  } from './useImmediateDerivedValue';
import { useAnimatedRecycleHandler } from './useAnimatedRecycleEvent';
// @ts-ignore TODO osdnk
import { useImmediateEffect } from './useImmediateEffect';
import { getDiffArray } from './diffArray';

type SharedValue<T> = { value: T }
const DataContext = createContext<SharedValue<any[]> | null>(null);
const RawDataContext = createContext<any[] | null>(null);
const PositionContext = createContext<Animated.SharedValue<number> | null>(
  null
);
const InitialPositionContext = createContext<number>(
  -1
);

const AnimatedRecyclableRow = Animated.createAnimatedComponent(RawRecyclerRow);

export function usePosition() {
  return useContext(PositionContext);
}

function useInitialPosition() {
  return useContext(InitialPositionContext);
}

function useData() {
  return useContext(DataContext);
}

function useRawData() {
  return useContext(RawDataContext);
}





export function useSharedDataAtIndex() {
  //const data = useData();
  const { id, lastEdited } = useData()
  const position = usePosition();
  const initialPosition = useInitialPosition();
  const rawData = useRawData()!;
  return useDerivedValue(() => {
    lastEdited.value
    console.log(lastEdited.value, global[`__ultimateList${id}`][position!.value])
    return global[`__ultimateList${id}`][position!.value]
  }, []);
}


export function useReactiveDataAtIndex() {
  const initialPosition = useInitialPosition()
  const [currentPosition, setPosition] = useState<number>(initialPosition);
  const sharedPosition = usePosition()

  useDerivedValue(() => {
    sharedPosition?.value !== -1 && runOnJS(setPosition)(sharedPosition!.value);
  })
  const rawDara = useRawData();
  return rawDara![currentPosition];
}

function RecyclerRowWrapper(props) {
  const position = useSharedValue<number>(-1);
  return (
    <PositionContext.Provider value={position}>
      <RawRecyclerRowWrapper {...props} />
    </PositionContext.Provider>

    )
}

export function RecyclerRow(props: ViewProps) {


  const [isBackupNeeded, setIsBackupNeeded] = useState<boolean>(true)
  const position = useContext(PositionContext);
  const initialPosition = useContext(InitialPositionContext);
  //useState(() => (position.value = props.initialPosition))
  const onRecycleHandler = useAnimatedRecycleHandler({ onRecycle: ({ position: newPosition, previousPosition }) => {
      'worklet';
      console.log(newPosition, previousPosition)
      if (isBackupNeeded) {
        runOnJS(setIsBackupNeeded)(false);
      }
      position!.value = newPosition

    }}, [isBackupNeeded]);

  const onRecycleHandlerBackup = useCallback(({ nativeEvent: { position: newPosition } }) => {
      position!.value = newPosition

    }, []);


  // TODO osdnk sometimes broken

  return (
      <AnimatedRecyclableRow {...props} onRecycle={onRecycleHandler} onRecycleBackup={isBackupNeeded ? onRecycleHandlerBackup : null} initialPosition={initialPosition}   />
  );
}

const namingHandler = {
  get(
    { binding }: { binding: string },
    property: string
  ): { binding: string } | string {
    if (property === '___binding') {
      return binding;
    }
    return new Proxy(
      { binding: binding === '' ? property : `${binding}.${property}` },
      namingHandler
    );
  },
};

export function useUltraFastData<TCellData extends object>() {
  return new Proxy({ binding: '' }, namingHandler) as any as TCellData;
}


export function UltraFastText({ binding }: { binding: string }) {
  return (
    // @ts-ignore
    <UltraFastTextWrapper binding={binding.___binding}>
      <Text style={{ width: 130 }} />
    </UltraFastTextWrapper>
  );
}

const AnimatedCellStorage = Animated.createAnimatedComponent(CellStorage)

const PRERENDERED_CELLS = 2; // todo osdnk

type WrappedView = { view: JSX.Element, maxRendered?: number }

type Descriptor = WrappedView | JSX.Element


function RecyclableViews({ viewTypes }: { viewTypes: { [_ :string]: Descriptor } }) {

  return (<>{Object.entries(viewTypes).map(([type, child]) => (
    <RecyclableViewsByType key={`rlvv-${type}`} type={type} maxRendered={(child as WrappedView).maxRendered}>
      {child.hasOwnProperty("view") ? (child as WrappedView).view : child as JSX.Element}
    </RecyclableViewsByType>
  ))}</>)
}

function RecyclableViewsByType({ children, type, maxRendered }: { children: React.ReactChild, type: string, maxRendered: number | undefined }) {
  const [cells, setCells] = useState<number>(2)
  const onMoreRowsNeededHandler = useAnimatedRecycleHandler({
    onMoreRowsNeeded: e => {
      "worklet"
      console.log(e)
      runOnJS(setCells)(e.cells)
    }
  }, [setCells])
  console.log(type, cells);
  // use reanimated event here and animated reaction
  return (
    <AnimatedCellStorage  style={{ opacity: 0.1 }} type={type} typeable={type} onMoreRowsNeeded={onMoreRowsNeededHandler} onMoreRowsNeededBackup={e => {
      const cellsn = e.nativeEvent.cells;
      if (cellsn > cells) {
        setCells(cellsn);
      }
    }} >
      {/* TODO make better render counting  */}
      {[...Array(Math.max(PRERENDERED_CELLS, cells))].map((_, index) => (
        <RecyclerRowWrapper
          removeClippedSubviews={false}
          initialPosition={index}
          key={`rl-${index}`}
          //initialPosition={index}
        >
          <InitialPositionContext.Provider value={index}>
            {children}
          </InitialPositionContext.Provider>
        </RecyclerRowWrapper>
      ))}
    </AnimatedCellStorage>
  );
}

let id = 0;





type TraversedData<T> = {
  data: T;
  type: string;
  sticky: boolean,
  hash: string;
}

export function useRowTypesLayout(descriptors: () =>  ({ [key :string]: Descriptor }), deps: any[] = []) {

  return useMemo(descriptors, [deps])
}


export function RecyclerView<TData>({
                               style,
                               data,
                               layoutProvider,
                               getViewType = () => "type",
                               getIsSticky = () => false,
                               getHash
                             }: {
  style: ViewStyle;
  data: TData[];
  layoutProvider: { [_ :string]: Descriptor },
  getViewType: (data: TData, i : number) => string
  getIsSticky: (data: TData, type: string, i : number) => boolean
  getHash: (data: TData, i : number) => string
}) {
  // @ts-ignore
  //global.setData(data)

  const [currId] = useState<number>(() => id++)
  const traversedData: TraversedData<TData>[] = useMemo(() => data.map(((row, index) => {
    const type = getViewType(row, index);
    const sticky = getIsSticky(row, type, index)
    const hash = getHash(row, index)
    return ({
      data: row, type, sticky, hash
    })
  })), [data, getIsSticky, getIsSticky, getHash])
  const prevData = useRef<TraversedData<TData>[]>()



 // const datas = useDerivedValue(() => data, []);
  const datas = useSharedValue<number>(0)
  //const datas = Platform.OS === 'ios' ? useSharedValue(data) : useDerivedValue(() => data, [data]);
  useImmediateEffect(() => {
    // Platform.OS === 'ios' && (datas.value = data);
    // @ts-ignore
    global[`__ultimateList${currId}`] = data
    runOnUI(() => {
      "worklet";
      // @ts-ignore
      global[`__ultimateList${currId}`] = data
      datas.value = Date.now();
    })()
    // @ts-ignore
    global._list___setData(traversedData, currId, prevData.current ? getDiffArray(prevData.current, traversedData) : undefined)
  }, [traversedData])


  useEffect(() => {
    // for ReText
    setTimeout(runOnUI(() => {
      "worklet";
      datas.value = Date.now() - 10;
    }), 100)
  }, [])

  // @ts-ignore
  useEffect(() => () => global._list___removeData(currId), [])

  prevData.current = traversedData;

  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isJustCalledRefresh, setIsJustCalledRefresh] = useState(false)
  // TODO
  useEffect(() => {
    if (isJustCalledRefresh && !isRefreshing) {
      setIsJustCalledRefresh(false)
      ref.current.setNativeProps({ isRefreshing: false })
    }
  },[isJustCalledRefresh])
  const ref = useRef<React.MutableRefObject<any>>();

  return (
    <RawDataContext.Provider value={data}>
      <DataContext.Provider value={{ id: currId, lastEdited: datas  }}>
        <View style={style} removeClippedSubviews={false}>
          <RecyclableViews viewTypes={layoutProvider}/>
          {/*<NativeViewGestureHandler*/}
          {/*  shouldActivateOnStart*/}
          {/*>*/}
          <RecyclerListView
            ref={ref}
            onRefresh={() => {
              console.log("XXX")
              Platform.OS === 'android' && setIsJustCalledRefresh(true)
              //setIsRefreshing(true);
              //requestAnimationFrame(() => ref.current.setNativeProps({ isRefreshing: false }))
              // setIsRefreshing(true);
              // setTimeout(() => setIsRefreshing(false), 3000)
            }}
            isRefreshing={isRefreshing}
            id={currId}
            identifier={currId}
            count={data.length}
            style={[StyleSheet.absoluteFill, { backgroundColor: 'red' }]}
          />
          {/*</NativeViewGestureHandler>*/}
        </View>
      </DataContext.Provider>
    </RawDataContext.Provider>
  );
}

